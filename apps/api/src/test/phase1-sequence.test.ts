import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { addVerifiedContact, createApp, multipart, png, registerUser, resetDatabase, verifyEmail } from "./helpers";

const DAY_MS = 24 * 60 * 60 * 1000;
const app = await createApp();
afterAll(async () => app.close());

beforeEach(async () => {
  process.env.VERIFICATION_RELEASES_ENABLED = "false";
  process.env.DIGI_TEST_MODE = "true";
  process.env.NODE_ENV = "test";
  await resetDatabase(app);
  const rows = await app.prisma.$queryRaw<{ name: string }[]>`SELECT current_database() AS name`;
  const name = rows[0]?.name;
  expect(name).not.toBe("digi_capsule");
});

async function setClock(cookie: string, instant: Date) {
  const response = await app.inject({
    method: "POST",
    url: "/v1/dev/clock",
    headers: { cookie },
    payload: { simulatedNow: instant.toISOString() },
  });
  expect(response.statusCode).toBe(200);
}

async function tick(cookie: string) {
  const response = await app.inject({
    method: "POST",
    url: "/v1/dev/worker/tick",
    headers: { cookie },
  });
  expect(response.statusCode).toBe(200);
  return response.json() as {
    calendarJobsSent: number;
    remindersSent: number;
    simulatedReleasesRecorded: number;
    verificationJobsSent: number;
  };
}

function plus(due: Date, days: number, extraMs = 0) {
  return new Date(due.getTime() + days * DAY_MS + extraMs);
}

describe("isolated missed-check-in sequence", () => {
  it("walks every warning boundary, repeats the worker, and keeps the letter private", async () => {
    const author = await registerUser(app, "sequence@example.test", "Sequence Author");
    await verifyEmail(app, author.cookie, author.token);
    const trusted = await addVerifiedContact(app, author.cookie, {
      displayName: "Trusted",
      email: "trusted-sequence@example.test",
      roles: ["trusted_contact"],
    });
    const recipient = await addVerifiedContact(app, author.cookie, {
      displayName: "Recipient",
      email: "recipient-sequence@example.test",
      roles: ["recipient"],
    });
    const bystander = await addVerifiedContact(app, author.cookie, {
      displayName: "Bystander",
      email: "bystander-sequence@example.test",
      roles: ["recipient"],
    });
    const created = await app.inject({
      method: "POST",
      url: "/v1/memories",
      headers: { cookie: author.cookie },
      payload: { title: "Private sequence", body: "PRIVATE_SEQUENCE_LETTER" },
    });
    const memoryId = created.json().memory.id as string;
    const photo = multipart(png, "secret-photo.png", "image/png");
    const uploaded = await app.inject({
      method: "POST",
      url: `/v1/memories/${memoryId}/attachments`,
      headers: { ...photo.headers, cookie: author.cookie },
      payload: photo.body,
    });
    expect(uploaded.statusCode).toBe(201);
    await app.inject({
      method: "POST",
      url: `/v1/memories/${memoryId}/schedule`,
      headers: { cookie: author.cookie },
      payload: { mode: "if_i_am_gone", recipientIds: [recipient.id] },
    });

    const cycle = await app.prisma.checkInCycle.findFirstOrThrow({ where: { userId: author.body.user.id, state: "due" } });
    const due = cycle.dueAt;

    await setClock(author.cookie, plus(due, 0, -1));
    expect((await tick(author.cookie)).remindersSent).toBe(0);
    let status = await app.inject({ method: "GET", url: "/v1/check-in", headers: { cookie: author.cookie } });
    expect(status.json().warningStage).toBe("on_time");

    const marks: { at: Date; stage: string; reminders: number }[] = [
      { at: plus(due, 0), stage: "missed_check_in", reminders: 1 },
      { at: plus(due, 3), stage: "missed_check_in", reminders: 1 },
      { at: plus(due, 7, -1), stage: "missed_check_in", reminders: 1 },
      { at: plus(due, 7), stage: "second_warning", reminders: 2 },
      { at: plus(due, 14, -1), stage: "second_warning", reminders: 2 },
      { at: plus(due, 14), stage: "final_warning", reminders: 3 },
      { at: plus(due, 21, -1), stage: "final_warning", reminders: 3 },
    ];
    for (const mark of marks) {
      await setClock(author.cookie, mark.at);
      const first = await tick(author.cookie);
      const second = await tick(author.cookie);
      expect(second.remindersSent).toBe(0);
      expect(second.simulatedReleasesRecorded).toBe(0);
      expect(second.calendarJobsSent).toBe(0);
      expect(second.verificationJobsSent).toBe(0);
      expect(first.verificationJobsSent).toBe(0);
      status = await app.inject({ method: "GET", url: "/v1/check-in", headers: { cookie: author.cookie } });
      expect(status.json().warningStage).toBe(mark.stage);
      expect(await app.prisma.notificationDelivery.count({ where: { channel: "email", templateId: { in: ["check_in_due", "check_in_reminder"] } } })).toBe(mark.reminders);
      expect(await app.prisma.notificationDelivery.count({ where: { channel: "sms", templateId: { in: ["check_in_due", "check_in_reminder"] } } })).toBe(mark.reminders);
      expect(await app.prisma.releaseJob.count()).toBe(0);
      expect(await app.prisma.checkInEvent.count({ where: { type: "simulated_release_recorded" } })).toBe(0);
      expect(await app.prisma.checkInEvent.count({ where: { type: "unreachable_notice_sent" } })).toBe(0);
    }

    await setClock(author.cookie, plus(due, 21));
    const releaseTick = await tick(author.cookie);
    expect(releaseTick.simulatedReleasesRecorded).toBe(1);
    expect(releaseTick.verificationJobsSent).toBe(0);
    expect(releaseTick.calendarJobsSent).toBe(0);
    const duplicate = await tick(author.cookie);
    expect(duplicate.simulatedReleasesRecorded).toBe(0);
    expect(duplicate.remindersSent).toBe(0);
    process.env.VERIFICATION_RELEASES_ENABLED = "true";
    const flagged = await tick(author.cookie);
    process.env.VERIFICATION_RELEASES_ENABLED = "false";
    expect(flagged.verificationJobsSent).toBe(0);
    const jobs = await app.prisma.releaseJob.findMany();
    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.personId).toBe(recipient.id);
    expect(jobs[0]?.personId).not.toBe(bystander.id);
    expect(jobs[0]?.personId).not.toBe(trusted.id);

    status = await app.inject({ method: "GET", url: "/v1/check-in", headers: { cookie: author.cookie } });
    expect(status.json().warningStage).toBe("simulated_conditional_release");
    expect(status.json().daysOverdue).toBe(21);

    const reminders = await app.prisma.devMessage.findMany({
      where: { templateId: { in: ["check_in_due", "check_in_reminder", "simulated_conditional_release"] } },
    });
    expect(reminders.every((row) => row.destination === "sequence@example.test" || row.destination === "sms-mock:sequence@example.test")).toBe(true);
    const trustedNotices = await app.prisma.devMessage.findMany({ where: { templateId: "trusted_contact_unreachable" } });
    expect(trustedNotices).toHaveLength(1);
    expect(trustedNotices[0]?.destination).toBe(trusted.email);
    expect(trustedNotices[0]?.destination).not.toBe(recipient.email);
    expect(trustedNotices[0]?.destination).not.toBe(bystander.email);

    const stored = await app.prisma.devMessage.findMany();
    const warnings = stored.filter((message) => !["memory_ready"].includes(message.templateId));
    const ready = stored.filter((message) => message.templateId === "memory_ready");
    expect(JSON.stringify(warnings)).not.toContain("PRIVATE_SEQUENCE_LETTER");
    expect(JSON.stringify(warnings)).not.toContain("secret-photo.png");
    expect(ready).toHaveLength(1);
    expect(ready[0]?.destination).toBe(recipient.email);
    expect(JSON.stringify(ready)).toContain("PRIVATE_SEQUENCE_LETTER");
    expect(JSON.stringify(ready)).toContain("secret-photo.png");
    const emailWarnings = stored.filter((message) => message.templateId === "check_in_due" || message.templateId === "check_in_reminder");
    const emailCopy = emailWarnings.filter((message) => JSON.stringify(message.variables).includes("\"channel\":\"email\""));
    expect(JSON.stringify(emailCopy)).not.toContain("we missed your check-in");
    const smsCopy = emailWarnings.filter((message) => JSON.stringify(message.variables).includes("\"channel\":\"sms\""));
    expect(smsCopy.length).toBeGreaterThan(0);
    expect(JSON.stringify(smsCopy)).toContain("we missed your check-in");
    const inbox = JSON.stringify(warnings);
    expect(inbox).toContain("This is the missed check-in warning.");
    expect(inbox).toContain("This is the second warning, 7 days after the missed check-in.");
    expect(inbox).toContain("This is the final warning, 14 days after the missed check-in.");
    expect(inbox).toContain("No memory was sent.");
    expect(inbox).toContain("This does not mean they have died.");
    expect(await app.prisma.notificationDelivery.count({ where: { channel: "sms" } })).toBe(3);

    const memory = await app.inject({ method: "GET", url: `/v1/memories/${memoryId}`, headers: { cookie: author.cookie } });
    expect(memory.json().memory.body).toBe("PRIVATE_SEQUENCE_LETTER");
    expect(memory.json().memory.status).toBe("released");
    expect(memory.json().memory.attachments).toHaveLength(1);
  });

  it("stops later warnings when I'm Alive is pressed before day 21", async () => {
    const author = await registerUser(app, "recover-sequence@example.test", "Recover Author");
    await verifyEmail(app, author.cookie, author.token);
    await addVerifiedContact(app, author.cookie, {
      displayName: "Trusted",
      email: "trusted-recover@example.test",
      roles: ["trusted_contact"],
    });
    const recipient = await addVerifiedContact(app, author.cookie, {
      displayName: "Recipient",
      email: "recipient-recover@example.test",
    });
    const created = await app.inject({
      method: "POST",
      url: "/v1/memories",
      headers: { cookie: author.cookie },
      payload: { title: "Still private", body: "RECOVER_PRIVATE_LETTER" },
    });
    const memoryId = created.json().memory.id as string;
    await app.inject({
      method: "POST",
      url: `/v1/memories/${memoryId}/schedule`,
      headers: { cookie: author.cookie },
      payload: { mode: "if_i_am_gone", recipientIds: [recipient.id] },
    });
    const cycle = await app.prisma.checkInCycle.findFirstOrThrow({ where: { userId: author.body.user.id, state: "due" } });
    await setClock(author.cookie, plus(cycle.dueAt, 7));
    await tick(author.cookie);
    expect(await app.prisma.notificationDelivery.count({ where: { channel: "email", templateId: { in: ["check_in_due", "check_in_reminder"] } } })).toBe(2);

    const aliveAt = plus(cycle.dueAt, 10);
    await setClock(author.cookie, aliveAt);
    const alive = await app.inject({ method: "POST", url: "/v1/check-in", headers: { cookie: author.cookie } });
    expect(alive.statusCode).toBe(200);
    expect(alive.json().reviewStopped).toBe(false);
    expect(alive.json().nextCheckInDueAt).toBe(plus(aliveAt, 30).toISOString());
    const closed = await app.prisma.checkInCycle.findUniqueOrThrow({ where: { id: cycle.id } });
    expect(closed.state).toBe("confirmed");

    await setClock(author.cookie, plus(cycle.dueAt, 21));
    const later = await tick(author.cookie);
    expect(later.remindersSent).toBe(0);
    expect(later.simulatedReleasesRecorded).toBe(0);
    expect(later.verificationJobsSent).toBe(0);
    expect(await app.prisma.releaseJob.count()).toBe(0);
    expect(await app.prisma.checkInEvent.count({ where: { type: "simulated_release_recorded" } })).toBe(0);
    expect(await app.prisma.checkInEvent.count({ where: { type: "unreachable_notice_sent" } })).toBe(0);
    expect(await app.prisma.notificationDelivery.count({ where: { channel: "email", templateId: "check_in_reminder" } })).toBe(1);
    const open = await app.prisma.checkInCycle.findFirstOrThrow({ where: { userId: author.body.user.id, state: "due" } });
    expect(open.dueAt.toISOString()).toBe(plus(aliveAt, 30).toISOString());
    expect(await app.prisma.checkInEvent.count({ where: { cycleId: open.id } })).toBe(0);
    const inbox = JSON.stringify(await app.prisma.devMessage.findMany());
    expect(inbox).not.toContain("RECOVER_PRIVATE_LETTER");
    expect(inbox).not.toContain("final warning");
    const memory = await app.inject({ method: "GET", url: `/v1/memories/${memoryId}`, headers: { cookie: author.cookie } });
    expect(memory.json().memory.status).toBe("scheduled");
  });

  it("delivers a Karachi calendar memory without starting the missed-check-in sequence", async () => {
    const author = await registerUser(app, "karachi@example.test", "Karachi Author");
    await verifyEmail(app, author.cookie, author.token);
    const calendarRecipient = await addVerifiedContact(app, author.cookie, {
      displayName: "Calendar",
      email: "calendar-karachi@example.test",
    });
    const goneRecipient = await addVerifiedContact(app, author.cookie, {
      displayName: "Gone",
      email: "gone-karachi@example.test",
    });
    await addVerifiedContact(app, author.cookie, {
      displayName: "Trusted",
      email: "trusted-karachi@example.test",
      roles: ["trusted_contact"],
    });
    const calendar = await app.inject({
      method: "POST",
      url: "/v1/memories",
      headers: { cookie: author.cookie },
      payload: { title: "On a date", body: "CALENDAR_ONLY_PHRASE" },
    });
    const gone = await app.inject({
      method: "POST",
      url: "/v1/memories",
      headers: { cookie: author.cookie },
      payload: { title: "If needed", body: "GONE_ONLY_PHRASE" },
    });
    const calendarId = calendar.json().memory.id as string;
    const goneId = gone.json().memory.id as string;
    const cycle = await app.prisma.checkInCycle.findFirstOrThrow({ where: { userId: author.body.user.id, state: "due" } });
    const deliverAt = new Date(cycle.dueAt.getTime() - 2 * DAY_MS);
    deliverAt.setUTCHours(4, 0, 0, 0);
    expect(deliverAt.getTime()).toBeLessThan(cycle.dueAt.getTime());
    const local = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Karachi",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(deliverAt);

    await setClock(author.cookie, new Date(deliverAt.getTime() - DAY_MS));
    const scheduled = await app.inject({
      method: "POST",
      url: `/v1/memories/${calendarId}/schedule`,
      headers: { cookie: author.cookie },
      payload: {
        mode: "on_date",
        localDate: local,
        localTime: "09:00",
        timeZone: "Asia/Karachi",
        recipientIds: [calendarRecipient.id],
      },
    });
    expect(scheduled.statusCode).toBe(200);
    await app.inject({
      method: "POST",
      url: `/v1/memories/${goneId}/schedule`,
      headers: { cookie: author.cookie },
      payload: { mode: "if_i_am_gone", recipientIds: [goneRecipient.id] },
    });

    await setClock(author.cookie, new Date(deliverAt.getTime() - 60 * 1000));
    expect((await tick(author.cookie)).calendarJobsSent).toBe(0);
    await setClock(author.cookie, deliverAt);
    const sent = await tick(author.cookie);
    expect(sent.calendarJobsSent).toBe(1);
    expect(sent.remindersSent).toBe(0);
    const again = await tick(author.cookie);
    expect(again.calendarJobsSent).toBe(0);

    const jobs = await app.prisma.releaseJob.findMany();
    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.personId).toBe(calendarRecipient.id);
    expect(jobs[0]?.capsuleItemId).toBe(calendarId);
    const ready = await app.prisma.devMessage.findMany({ where: { templateId: "memory_ready" } });
    expect(ready).toHaveLength(1);
    expect(ready[0]?.destination).toBe("calendar-karachi@example.test");

    await setClock(author.cookie, cycle.dueAt);
    const warning = await tick(author.cookie);
    expect(warning.remindersSent).toBe(1);
    expect(warning.calendarJobsSent).toBe(0);
    expect(warning.simulatedReleasesRecorded).toBe(0);
    expect(await app.prisma.releaseJob.count()).toBe(1);
    const checkInNotices = await app.prisma.devMessage.findMany({ where: { templateId: "check_in_due" } });
    const authorEmail = checkInNotices.find((message) => message.destination === "karachi@example.test");
    const authorSms = checkInNotices.find((message) => message.destination === "sms-mock:karachi@example.test");
    expect(authorEmail).toBeTruthy();
    expect(authorSms).toBeTruthy();
    expect(JSON.stringify(authorEmail?.variables)).not.toContain("CALENDAR_ONLY_PHRASE");
    expect(JSON.stringify(authorEmail?.variables)).not.toContain("GONE_ONLY_PHRASE");

    const inbox = await app.prisma.devMessage.findMany();
    const readyCopy = inbox.find((message) => message.templateId === "memory_ready");
    expect(JSON.stringify(readyCopy?.variables)).toContain("CALENDAR_ONLY_PHRASE");
    expect(JSON.stringify(inbox.filter((message) => message.templateId !== "memory_ready"))).not.toContain("CALENDAR_ONLY_PHRASE");
    expect(JSON.stringify(inbox)).not.toContain("GONE_ONLY_PHRASE");
    const calendarMemory = await app.inject({ method: "GET", url: `/v1/memories/${calendarId}`, headers: { cookie: author.cookie } });
    const goneMemory = await app.inject({ method: "GET", url: `/v1/memories/${goneId}`, headers: { cookie: author.cookie } });
    expect(calendarMemory.json().memory.status).toBe("released");
    expect(goneMemory.json().memory.status).toBe("scheduled");
    const rule = await app.prisma.releaseRule.findFirstOrThrow({ where: { capsuleItemId: calendarId } });
    expect(rule.timeZone).toBe("Asia/Karachi");
    expect(rule.nextRunAt).toBeNull();
  });
});
