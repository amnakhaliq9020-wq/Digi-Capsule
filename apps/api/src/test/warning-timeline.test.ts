import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { capturedMail } from "../lib/mail";
import { runWorkerTick } from "../services/worker-tick";
import { addVerifiedContact, createApp, registerUser, resetDatabase, verifyEmail } from "./helpers";

const DAY_MS = 24 * 60 * 60 * 1000;
const app = await createApp();
afterAll(async () => app.close());

beforeEach(async () => {
  process.env.NODE_ENV = "test";
  process.env.DIGI_TEST_MODE = "true";
  process.env.DIGI_EMAIL_FAIL = "false";
  process.env.DIGI_SMS_FAIL = "false";
  delete process.env.DIGI_SMTP_RESULT;
  process.env.VERIFICATION_RELEASES_ENABLED = "false";
  capturedMail.length = 0;
  await resetDatabase(app);
});

async function setClock(instant: Date) {
  await app.prisma.devClock.upsert({
    where: { id: 1 },
    create: { id: 1, simulatedNow: instant },
    update: { simulatedNow: instant },
  });
}

function plus(due: Date, days: number, extraMs = 0) {
  return new Date(due.getTime() + days * DAY_MS + extraMs);
}

async function author(email: string, name: string) {
  const user = await registerUser(app, email, name);
  await verifyEmail(app, user.cookie, user.token);
  await app.prisma.profile.update({ where: { userId: user.body.user.id }, data: { timeZone: "Asia/Karachi" } });
  const cycle = await app.prisma.checkInCycle.findFirstOrThrow({ where: { userId: user.body.user.id, state: "due" } });
  return { user, cycle };
}

describe("warning timeline and false-alarm recovery", () => {
  it("sends each warning on its boundary and never twice", async () => {
    const { user, cycle } = await author("timeline@example.test", "Timeline Author");
    const marks = [0, 7, 14, 21, 23, 30];
    for (const day of marks) {
      await setClock(plus(cycle.dueAt, day, -1));
      const early = await runWorkerTick(app.prisma, { simulated: true, ownerUserId: user.body.user.id });
      expect(early.remindersSent).toBe(0);
      expect(early.confirmationEscalations).toBe(0);
      expect(early.simulatedReleasesRecorded).toBe(0);
      await setClock(plus(cycle.dueAt, day));
      await runWorkerTick(app.prisma, { simulated: true, ownerUserId: user.body.user.id });
      const repeat = await runWorkerTick(app.prisma, { simulated: true, ownerUserId: user.body.user.id });
      expect(repeat.remindersSent).toBe(0);
      expect(repeat.confirmationEscalations).toBe(0);
      expect(repeat.simulatedReleasesRecorded).toBe(0);
    }

    const emails = await app.prisma.notificationDelivery.findMany({ where: { channel: "email" } });
    const byTemplate = (templateId: string) => emails.filter((row) => row.templateId === templateId);
    expect(byTemplate("check_in_due")).toHaveLength(1);
    expect(byTemplate("check_in_reminder")).toHaveLength(2);
    expect(byTemplate("check_in_window_final")).toHaveLength(1);
    expect(byTemplate("check_in_escalation")).toHaveLength(1);
    expect(byTemplate("simulated_conditional_release")).toHaveLength(1);
    expect(emails.every((row) => row.status === "sent")).toBe(true);
    expect(new Set(emails.map((row) => row.idempotencyKey)).size).toBe(emails.length);

    const sms = await app.prisma.notificationDelivery.findMany({ where: { channel: "sms" } });
    expect(sms.filter((row) => row.templateId === "check_in_due")).toHaveLength(1);
    expect(sms.filter((row) => row.templateId === "check_in_reminder")).toHaveLength(2);
    expect(sms.filter((row) => row.templateId === "check_in_window_final")).toHaveLength(1);
    expect(sms.filter((row) => row.templateId === "check_in_escalation")).toHaveLength(0);
    expect(sms.every((row) => row.destinationHash || row.status === "sent")).toBe(true);
    expect(await app.prisma.devMessage.count({ where: { destination: "sms-mock:timeline@example.test" } })).toBe(4);

    const dueMail = await app.prisma.devMessage.findFirstOrThrow({
      where: { templateId: "check_in_due", destination: "timeline@example.test" },
    });
    const variables = dueMail.variables as { timeZone: string; utcDeadline: string; localDeadline: string; text: string };
    expect(variables.timeZone).toBe("Asia/Karachi");
    expect(variables.utcDeadline).toBe(plus(cycle.dueAt, 30).toISOString());
    expect(variables.localDeadline.length).toBeGreaterThan(8);
    expect(variables.text).toContain(variables.localDeadline);
    expect(variables.text).not.toContain("PRIVATE");

    const policy = await app.prisma.checkInPolicy.findUniqueOrThrow({ where: { userId: user.body.user.id } });
    expect(policy.accountCheckStatus).toBe("escalation_pending");
    expect(policy.confirmationDeadline?.toISOString()).toBe(plus(cycle.dueAt, 30).toISOString());
    expect(await app.prisma.releaseJob.count()).toBe(0);
    expect(await app.prisma.checkInEvent.count({ where: { type: "simulated_release_recorded" } })).toBe(1);
    expect(await app.prisma.checkInEvent.count({ where: { type: "unreachable_notice_sent" } })).toBe(1);
  });

  it("catches up a delayed worker once per stage", async () => {
    const { user, cycle } = await author("delayed@example.test", "Delayed Author");
    await setClock(plus(cycle.dueAt, 30));
    const jumped = await runWorkerTick(app.prisma, { simulated: true, ownerUserId: user.body.user.id });
    expect(jumped.remindersSent).toBe(4);
    expect(jumped.confirmationEscalations).toBe(1);
    expect(jumped.simulatedReleasesRecorded).toBe(1);
    const again = await runWorkerTick(app.prisma, { simulated: true, ownerUserId: user.body.user.id });
    expect(again.remindersSent + again.confirmationEscalations + again.simulatedReleasesRecorded).toBe(0);
    const sentEmails = await app.prisma.notificationDelivery.findMany({
      where: { channel: "email", status: "sent", templateId: { not: "email_verification" } },
    });
    expect(sentEmails.map((row) => row.templateId).sort()).toEqual([
      "check_in_due",
      "check_in_escalation",
      "check_in_reminder",
      "check_in_reminder",
      "check_in_window_final",
      "simulated_conditional_release",
    ]);
    expect(await app.prisma.devMessage.count({
      where: { destination: "delayed@example.test", templateId: { not: "email_verification" } },
    })).toBe(6);
  });

  it("resets the cycle and drops old notices when the author checks in", async () => {
    const { user, cycle } = await author("reset-cycle@example.test", "Reset Cycle");
    await setClock(plus(cycle.dueAt, 10));
    await runWorkerTick(app.prisma, { simulated: true, ownerUserId: user.body.user.id });
    await app.prisma.notificationDelivery.create({
      data: {
        userId: user.body.user.id,
        idempotencyKey: "pending-window-final",
        channel: "email",
        templateId: "check_in_window_final",
        destinationHash: "pending",
        status: "pending",
        relatedType: "check_in_cycle",
        relatedId: cycle.id,
        generationId: 1,
      },
    });
    const alive = await app.inject({ method: "POST", url: "/v1/check-in", headers: { cookie: user.cookie } });
    expect(alive.statusCode).toBe(200);
    const policy = await app.prisma.checkInPolicy.findUniqueOrThrow({ where: { userId: user.body.user.id } });
    expect(policy.accountCheckStatus).toBe("on_time");
    expect(policy.warningGeneration).toBe(2);
    expect(policy.confirmationDeadline).toBeNull();
    expect(policy.escalationStatus).toBe("none");
    expect(policy.nextCheckAt.toISOString()).toBe(plus(plus(cycle.dueAt, 10), 30).toISOString());
    const pending = await app.prisma.notificationDelivery.findUniqueOrThrow({ where: { idempotencyKey: "pending-window-final" } });
    expect(pending.status).toBe("cancelled");
    const closed = await app.prisma.checkInCycle.findUniqueOrThrow({ where: { id: cycle.id } });
    expect(closed.state).toBe("confirmed");

    await setClock(plus(cycle.dueAt, 30));
    const later = await runWorkerTick(app.prisma, { simulated: true, ownerUserId: user.body.user.id });
    expect(later.remindersSent).toBe(0);
    expect(later.confirmationEscalations).toBe(0);
    expect(later.simulatedReleasesRecorded).toBe(0);
    expect(await app.prisma.notificationDelivery.count({ where: { templateId: "check_in_escalation", status: "sent" } })).toBe(0);
    expect(await app.prisma.notificationDelivery.count({ where: { templateId: "check_in_window_final", status: "sent" } })).toBe(0);
    expect(await app.prisma.releaseJob.count()).toBe(0);
  });

  it("stops an unsent release after a late check-in and leaves an accepted message unrecalled", async () => {
    const { user, cycle } = await author("false-alarm@example.test", "False Alarm");
    const recipient = await addVerifiedContact(app, user.cookie, {
      displayName: "Receiver",
      email: "false-alarm-receiver@example.test",
      phone: "+1 555 010 0191",
    });
    const created = await app.inject({
      method: "POST",
      url: "/v1/memories",
      headers: { cookie: user.cookie },
      payload: { title: "Still mine", body: "FALSE_ALARM_LETTER" },
    });
    const memoryId = created.json().memory.id as string;
    const scheduled = await app.inject({
      method: "POST",
      url: `/v1/memories/${memoryId}/schedule`,
      headers: { cookie: user.cookie },
      payload: { mode: "if_i_am_gone", recipientIds: [recipient.id] },
    });
    expect(scheduled.statusCode).toBe(200);

    await setClock(plus(cycle.dueAt, 21));
    const released = await runWorkerTick(app.prisma, { simulated: true, ownerUserId: user.body.user.id });
    expect(released.simulatedReleasesRecorded).toBe(1);
    const sentJob = await app.prisma.releaseJob.findFirstOrThrow();
    expect(sentJob.status).toBe("sent");
    expect(await app.prisma.devMessage.count({ where: { templateId: "memory_ready", destination: recipient.email } })).toBe(1);

    const alive = await app.inject({ method: "POST", url: "/v1/check-in", headers: { cookie: user.cookie } });
    expect(alive.statusCode).toBe(200);
    const policy = await app.prisma.checkInPolicy.findUniqueOrThrow({ where: { userId: user.body.user.id } });
    expect(policy.accountCheckStatus).toBe("on_time");
    expect(policy.warningGeneration).toBe(2);
    const kept = await app.prisma.releaseJob.findUniqueOrThrow({ where: { id: sentJob.id } });
    expect(kept.status).toBe("sent");
    const memory = await app.prisma.capsuleItem.findUniqueOrThrow({ where: { id: memoryId } });
    expect(memory.status).toBe("released");

    await setClock(plus(cycle.dueAt, 30));
    const later = await runWorkerTick(app.prisma, { simulated: true, ownerUserId: user.body.user.id });
    expect(later.remindersSent + later.simulatedReleasesRecorded + later.calendarJobsSent).toBe(0);
    expect(await app.prisma.devMessage.count({ where: { templateId: "memory_ready" } })).toBe(1);
    expect(await app.prisma.releaseJob.count()).toBe(1);
  });

  it("cancels a failed release and does not retry it after the author checks in", async () => {
    const { user, cycle } = await author("failed-release@example.test", "Failed Release");
    const recipient = await addVerifiedContact(app, user.cookie, {
      displayName: "Receiver",
      email: "failed-release-receiver@example.test",
      phone: "+1 555 010 0192",
    });
    const created = await app.inject({
      method: "POST",
      url: "/v1/memories",
      headers: { cookie: user.cookie },
      payload: { title: "Held", body: "FAILED_RELEASE_LETTER" },
    });
    const memoryId = created.json().memory.id as string;
    await app.inject({
      method: "POST",
      url: `/v1/memories/${memoryId}/schedule`,
      headers: { cookie: user.cookie },
      payload: { mode: "if_i_am_gone", recipientIds: [recipient.id] },
    });
    await setClock(plus(cycle.dueAt, 21));
    await runWorkerTick(app.prisma, { simulated: true, ownerUserId: user.body.user.id });
    const job = await app.prisma.releaseJob.findFirstOrThrow();
    const notice = await app.prisma.notificationDelivery.findFirstOrThrow({ where: { templateId: "memory_ready" } });
    await app.prisma.releaseJob.update({
      where: { id: job.id },
      data: { status: "failed", retryable: true, nextAttemptAt: plus(cycle.dueAt, 21), dispatchStartedAt: null, sentAt: null },
    });
    await app.prisma.notificationDelivery.update({
      where: { id: notice.id },
      data: { status: "failed", retryable: true, nextAttemptAt: plus(cycle.dueAt, 21), dispatchStartedAt: null },
    });
    await app.prisma.capsuleItem.update({ where: { id: memoryId }, data: { status: "scheduled", releasedAt: null } });
    await app.prisma.releaseRule.updateMany({ where: { capsuleItemId: memoryId }, data: { status: "active" } });
    await app.prisma.devMessage.deleteMany({ where: { templateId: "memory_ready" } });

    const alive = await app.inject({ method: "POST", url: "/v1/check-in", headers: { cookie: user.cookie } });
    expect(alive.statusCode).toBe(200);
    expect((await app.prisma.releaseJob.findUniqueOrThrow({ where: { id: job.id } })).status).toBe("cancelled");
    expect((await app.prisma.capsuleItem.findUniqueOrThrow({ where: { id: memoryId } })).status).toBe("scheduled");

    await setClock(plus(cycle.dueAt, 22));
    const later = await runWorkerTick(app.prisma, { simulated: true, ownerUserId: user.body.user.id });
    expect(later.calendarJobsSent).toBe(0);
    expect(later.simulatedReleasesRecorded).toBe(0);
    expect(await app.prisma.devMessage.count({ where: { templateId: "memory_ready" } })).toBe(0);
    expect(await app.prisma.releaseJob.count({ where: { status: "sent" } })).toBe(0);
    const inbox = JSON.stringify(await app.prisma.devMessage.findMany());
    expect(inbox).not.toContain("FAILED_RELEASE_LETTER");
  });

  it("retries one failed release while the missed cycle is still open", async () => {
    const { user, cycle } = await author("retry-release@example.test", "Retry Release");
    const recipient = await addVerifiedContact(app, user.cookie, {
      displayName: "Receiver",
      email: "retry-release-receiver@example.test",
      phone: "+1 555 010 0193",
    });
    const created = await app.inject({
      method: "POST",
      url: "/v1/memories",
      headers: { cookie: user.cookie },
      payload: { title: "Retry", body: "RETRY_RELEASE_LETTER" },
    });
    const memoryId = created.json().memory.id as string;
    await app.inject({
      method: "POST",
      url: `/v1/memories/${memoryId}/schedule`,
      headers: { cookie: user.cookie },
      payload: { mode: "if_i_am_gone", recipientIds: [recipient.id] },
    });
    await setClock(plus(cycle.dueAt, 21));
    await runWorkerTick(app.prisma, { simulated: true, ownerUserId: user.body.user.id });
    const job = await app.prisma.releaseJob.findFirstOrThrow();
    const notice = await app.prisma.notificationDelivery.findFirstOrThrow({ where: { templateId: "memory_ready" } });
    await app.prisma.releaseJob.update({
      where: { id: job.id },
      data: { status: "failed", retryable: true, nextAttemptAt: plus(cycle.dueAt, 21), dispatchStartedAt: null, sentAt: null },
    });
    await app.prisma.notificationDelivery.update({
      where: { id: notice.id },
      data: { status: "failed", retryable: true, nextAttemptAt: plus(cycle.dueAt, 21), dispatchStartedAt: null, providerMessageId: null },
    });
    await app.prisma.capsuleItem.update({ where: { id: memoryId }, data: { status: "scheduled", releasedAt: null } });
    await app.prisma.releaseRule.updateMany({ where: { capsuleItemId: memoryId }, data: { status: "active" } });
    await app.prisma.devMessage.deleteMany({ where: { templateId: "memory_ready" } });

    await setClock(plus(cycle.dueAt, 21, 60_000));
    const retried = await runWorkerTick(app.prisma, { simulated: true, ownerUserId: user.body.user.id });
    expect(retried.simulatedReleasesRecorded).toBe(0);
    expect((await app.prisma.releaseJob.findUniqueOrThrow({ where: { id: job.id } })).status).toBe("sent");
    expect(await app.prisma.devMessage.count({ where: { templateId: "memory_ready", destination: recipient.email } })).toBe(1);
    expect(await app.prisma.notificationDelivery.count({ where: { templateId: "memory_ready" } })).toBe(1);
    const again = await runWorkerTick(app.prisma, { simulated: true, ownerUserId: user.body.user.id });
    expect(again.calendarJobsSent).toBe(0);
    expect(await app.prisma.devMessage.count({ where: { templateId: "memory_ready" } })).toBe(1);
    expect((await app.prisma.capsuleItem.findUniqueOrThrow({ where: { id: memoryId } })).status).toBe("released");
  });

  it("holds warnings while paused, after a cancelled schedule, and after a contact is removed", async () => {
    const { user, cycle } = await author("stopped@example.test", "Stopped Author");
    const trusted = await addVerifiedContact(app, user.cookie, {
      displayName: "Trusted",
      email: "stopped-trusted@example.test",
      phone: "+1 555 010 0194",
      roles: ["trusted_contact"],
    });
    const recipient = await addVerifiedContact(app, user.cookie, {
      displayName: "Receiver",
      email: "stopped-receiver@example.test",
      phone: "+1 555 010 0195",
    });
    const created = await app.inject({
      method: "POST",
      url: "/v1/memories",
      headers: { cookie: user.cookie },
      payload: { title: "Paused", body: "STOPPED_FLOW_LETTER" },
    });
    const memoryId = created.json().memory.id as string;
    await app.inject({
      method: "POST",
      url: `/v1/memories/${memoryId}/schedule`,
      headers: { cookie: user.cookie },
      payload: { mode: "if_i_am_gone", recipientIds: [recipient.id] },
    });

    await setClock(plus(cycle.dueAt, 6));
    const paused = await app.inject({ method: "POST", url: "/v1/check-in/pause", headers: { cookie: user.cookie } });
    expect(paused.statusCode).toBe(200);
    await setClock(plus(cycle.dueAt, 14));
    const held = await runWorkerTick(app.prisma, { simulated: true, ownerUserId: user.body.user.id });
    expect(held.remindersSent).toBe(0);
    expect(await app.prisma.notificationDelivery.count({ where: { templateId: "check_in_due" } })).toBe(0);
    const policy = await app.prisma.checkInPolicy.findUniqueOrThrow({ where: { userId: user.body.user.id } });
    expect(policy.accountCheckStatus).toBe("paused");

    await app.inject({ method: "POST", url: "/v1/check-in/resume", headers: { cookie: user.cookie } });
    const removedTrusted = await app.inject({ method: "DELETE", url: `/v1/contacts/${trusted.id}`, headers: { cookie: user.cookie } });
    expect(removedTrusted.statusCode).toBe(204);
    const removedRecipient = await app.inject({ method: "DELETE", url: `/v1/contacts/${recipient.id}`, headers: { cookie: user.cookie } });
    expect(removedRecipient.statusCode).toBe(204);
    const cancelled = await app.inject({ method: "POST", url: `/v1/memories/${memoryId}/cancel`, headers: { cookie: user.cookie } });
    expect(cancelled.statusCode).toBe(200);

    await setClock(plus(cycle.dueAt, 21));
    const tick = await runWorkerTick(app.prisma, { simulated: true, ownerUserId: user.body.user.id });
    expect(tick.simulatedReleasesRecorded).toBe(1);
    expect(await app.prisma.releaseJob.count()).toBe(0);
    expect(await app.prisma.devMessage.count({ where: { templateId: "memory_ready" } })).toBe(0);
    expect(await app.prisma.devMessage.count({ where: { templateId: "trusted_contact_unreachable" } })).toBe(0);
    expect(await app.prisma.devMessage.count({ where: { destination: "stopped@example.test", templateId: "check_in_due" } })).toBe(1);
    const stored = JSON.stringify(await app.prisma.devMessage.findMany());
    expect(stored).not.toContain("STOPPED_FLOW_LETTER");
    expect((await app.prisma.capsuleItem.findUniqueOrThrow({ where: { id: memoryId } })).status).not.toBe("released");
  });

  it("records one warning when two workers and a stale claim race", async () => {
    const { user, cycle } = await author("race-warning@example.test", "Race Warning");
    const recipient = await addVerifiedContact(app, user.cookie, {
      displayName: "Receiver",
      email: "race-warning-receiver@example.test",
      phone: "+1 555 010 0196",
    });
    const created = await app.inject({
      method: "POST",
      url: "/v1/memories",
      headers: { cookie: user.cookie },
      payload: { title: "Race", body: "RACE_WARNING_LETTER" },
    });
    const memoryId = created.json().memory.id as string;
    await app.inject({
      method: "POST",
      url: `/v1/memories/${memoryId}/schedule`,
      headers: { cookie: user.cookie },
      payload: { mode: "if_i_am_gone", recipientIds: [recipient.id] },
    });
    await setClock(plus(cycle.dueAt, 21));
    const [first, second] = await Promise.all([
      runWorkerTick(app.prisma, { simulated: true, ownerUserId: user.body.user.id, workerId: "worker-a" }),
      runWorkerTick(app.prisma, { simulated: true, ownerUserId: user.body.user.id, workerId: "worker-b" }),
    ]);
    expect(first.simulatedReleasesRecorded + second.simulatedReleasesRecorded).toBe(1);
    expect(await app.prisma.checkInEvent.count({ where: { type: "simulated_release_recorded" } })).toBe(1);
    expect(await app.prisma.checkInEvent.count({ where: { type: "unreachable_notice_sent" } })).toBe(1);
    expect(await app.prisma.releaseJob.count()).toBe(1);
    expect(await app.prisma.devMessage.count({ where: { templateId: "memory_ready" } })).toBe(1);
    expect(await app.prisma.notificationDelivery.count({ where: { templateId: "check_in_due", channel: "email" } })).toBe(1);
  });

  it("sends a warning once after a worker crash before acceptance", async () => {
    const { user, cycle } = await author("crash-warning@example.test", "Crash Warning");
    await setClock(cycle.dueAt);
    await app.prisma.notificationDelivery.create({
      data: {
        userId: user.body.user.id,
        idempotencyKey: `check-in:${user.body.user.id}:${cycle.id}:g1:missed_check_in:email`,
        channel: "email",
        templateId: "check_in_due",
        destinationHash: "crash",
        status: "processing",
        relatedType: "check_in_cycle",
        relatedId: cycle.id,
        generationId: 1,
        claimedAt: new Date("2020-01-01T00:00:00.000Z"),
        dispatchStartedAt: null,
        payload: { to: "crash-warning@example.test", authorName: "Crash Warning", channel: "email", stage: "missed_check_in" },
      },
    });
    const recovered = await runWorkerTick(app.prisma, { simulated: true, ownerUserId: user.body.user.id });
    expect(recovered.remindersSent).toBe(1);
    const rows = await app.prisma.notificationDelivery.findMany({ where: { templateId: "check_in_due", channel: "email" } });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.status).toBe("sent");
    expect(await app.prisma.checkInEvent.count({ where: { cycleId: cycle.id, type: "notice_sent", offsetDays: 0 } })).toBe(1);
    expect(await app.prisma.devMessage.count({ where: { templateId: "check_in_due", destination: "crash-warning@example.test" } })).toBe(1);
    const repeat = await runWorkerTick(app.prisma, { simulated: true, ownerUserId: user.body.user.id });
    expect(repeat.remindersSent).toBe(0);
    expect(await app.prisma.notificationDelivery.count({ where: { templateId: "check_in_due", channel: "email" } })).toBe(1);
  });

  it("keeps an uncertain warning from being sent again", async () => {
    const { user, cycle } = await author("uncertain-warning@example.test", "Uncertain Warning");
    await setClock(cycle.dueAt);
    process.env.DIGI_SMTP_RESULT = "ambiguous";
    const first = await runWorkerTick(app.prisma, { simulated: true, ownerUserId: user.body.user.id });
    expect(first.remindersSent).toBe(0);
    const row = await app.prisma.notificationDelivery.findFirstOrThrow({ where: { templateId: "check_in_due", channel: "email" } });
    expect(row.status).toBe("uncertain");
    expect(row.retryable).toBe(false);
    const accepted = capturedMail.filter((message) => message.to === "uncertain-warning@example.test");
    expect(accepted).toHaveLength(1);
    const second = await runWorkerTick(app.prisma, { simulated: true, ownerUserId: user.body.user.id });
    expect(second.remindersSent).toBe(0);
    expect(capturedMail.filter((message) => message.to === "uncertain-warning@example.test")).toHaveLength(1);
    expect(await app.prisma.notificationDelivery.count({ where: { templateId: "check_in_due", channel: "email" } })).toBe(1);
    delete process.env.DIGI_SMTP_RESULT;
  });
});
