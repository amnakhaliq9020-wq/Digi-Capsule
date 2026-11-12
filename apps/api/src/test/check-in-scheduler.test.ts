import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { runWorkerTick } from "../services/worker-tick";
import { createApp, registerUser, resetDatabase, verifyEmail } from "./helpers";
import { sha256 } from "../lib/crypto";

const DAY_MS = 24 * 60 * 60 * 1000;
const app = await createApp();
afterAll(async () => app.close());

beforeEach(async () => {
  process.env.DIGI_EMAIL_FAIL = "false";
  process.env.DIGI_TEST_MODE = "true";
  process.env.NODE_ENV = "test";
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

describe("automatic 30-day check-in", () => {
  it("leaves an account alone before 30 days and emails it when the due time arrives", async () => {
    const author = await registerUser(app, "quiet@example.test", "Quiet Author");
    await verifyEmail(app, author.cookie, author.token);
    const cycle = await app.prisma.checkInCycle.findFirstOrThrow({ where: { userId: author.body.user.id, state: "due" } });

    await setClock(plus(cycle.dueAt, 0, -1));
    const early = await runWorkerTick(app.prisma, { simulated: true });
    expect(early.remindersSent).toBe(0);
    expect(await app.prisma.notificationDelivery.count({ where: { templateId: "check_in_due" } })).toBe(0);

    await setClock(cycle.dueAt);
    const due = await runWorkerTick(app.prisma, { simulated: true });
    expect(due.remindersSent).toBe(1);
    const policy = await app.prisma.checkInPolicy.findUniqueOrThrow({ where: { userId: author.body.user.id } });
    expect(policy.accountCheckStatus).toBe("awaiting_confirmation");
    expect(policy.confirmationRequestedAt?.toISOString()).toBe(cycle.dueAt.toISOString());
    expect(policy.confirmationDeadline?.toISOString()).toBe(plus(cycle.dueAt, 30).toISOString());
    const email = await app.prisma.devMessage.findFirstOrThrow({
      where: { templateId: "check_in_due", destination: "quiet@example.test" },
    });
    const variables = email.variables as { link?: string; text?: string };
    expect(variables.link).toContain("/check-in/confirm?token=");
    expect(variables.text).toContain("This is the missed check-in warning.");
    expect(variables.text).not.toContain("PRIVATE");
    const token = new URL(variables.link || "").searchParams.get("token");
    const confirmed = await app.inject({ method: "POST", url: "/v1/check-in/confirm", payload: { token } });
    expect(confirmed.statusCode).toBe(200);
    const repeat = await app.inject({ method: "POST", url: "/v1/check-in/confirm", payload: { token } });
    expect(repeat.statusCode).toBe(400);
    const policyAfter = await app.prisma.checkInPolicy.findUniqueOrThrow({ where: { userId: author.body.user.id } });
    expect(policyAfter.accountCheckStatus).toBe("on_time");
    expect(policyAfter.confirmationDeadline).toBeNull();
    expect(policyAfter.lastConfirmedAt?.toISOString()).toBe(cycle.dueAt.toISOString());
    expect(policyAfter.nextCheckAt.toISOString()).toBe(plus(cycle.dueAt, 30).toISOString());
    expect(await app.prisma.releaseJob.count()).toBe(0);
  });

  it("sends reminders at 7 and 14 days and a final warning before the window ends", async () => {
    const author = await registerUser(app, "remind@example.test", "Remind Author");
    await verifyEmail(app, author.cookie, author.token);
    const cycle = await app.prisma.checkInCycle.findFirstOrThrow({ where: { userId: author.body.user.id, state: "due" } });
    const marks = [
      { day: 0, template: "check_in_due" },
      { day: 7, template: "check_in_reminder" },
      { day: 14, template: "check_in_reminder" },
      { day: 23, template: "check_in_window_final" },
    ];
    for (const mark of marks) {
      await setClock(plus(cycle.dueAt, mark.day));
      await runWorkerTick(app.prisma, { simulated: true });
      const again = await runWorkerTick(app.prisma, { simulated: true });
      expect(again.remindersSent).toBe(0);
      expect(await app.prisma.devMessage.count({ where: { templateId: mark.template, destination: "remind@example.test" } })).toBeGreaterThan(0);
    }
    const emails = await app.prisma.notificationDelivery.findMany({
      where: { channel: "email", templateId: { in: ["check_in_due", "check_in_reminder", "check_in_window_final"] } },
    });
    expect(emails).toHaveLength(4);
    expect(await app.prisma.releaseJob.count()).toBe(0);
  });

  it("resets the countdown from a confirmation link and cancels escalation", async () => {
    const author = await registerUser(app, "reset@example.test", "Reset Author");
    await verifyEmail(app, author.cookie, author.token);
    const cycle = await app.prisma.checkInCycle.findFirstOrThrow({ where: { userId: author.body.user.id, state: "due" } });
    await setClock(plus(cycle.dueAt, 30));
    const escalated = await runWorkerTick(app.prisma, { simulated: true });
    expect(escalated.confirmationEscalations).toBe(1);
    const pending = await app.prisma.checkInPolicy.findUniqueOrThrow({ where: { userId: author.body.user.id } });
    expect(pending.escalationStatus).toBe("pending");
    expect(pending.accountCheckStatus).toBe("escalation_pending");
    expect(await app.prisma.releaseJob.count()).toBe(0);

    const again = await runWorkerTick(app.prisma, { simulated: true });
    expect(again.confirmationEscalations).toBe(0);
    expect(await app.prisma.notificationDelivery.count({ where: { templateId: "check_in_escalation" } })).toBe(1);

    const message = await app.prisma.devMessage.findFirstOrThrow({
      where: { templateId: "check_in_window_final", destination: "reset@example.test" },
    });
    const link = (message.variables as { link: string }).link;
    const token = new URL(link).searchParams.get("token");
    const expiredLink = await app.inject({
      method: "POST",
      url: "/v1/check-in/confirm",
      payload: { token },
    });
    expect(expiredLink.statusCode).toBe(400);
    expect(expiredLink.json().error.code).toBe("TOKEN_EXPIRED");
    const confirmed = await app.inject({
      method: "POST",
      url: "/v1/check-in",
      headers: { cookie: author.cookie },
    });
    expect(confirmed.statusCode).toBe(200);
    expect(confirmed.json().reviewStopped).toBe(false);

    const policy = await app.prisma.checkInPolicy.findUniqueOrThrow({ where: { userId: author.body.user.id } });
    expect(policy.escalationStatus).toBe("cancelled");
    expect(policy.accountCheckStatus).toBe("on_time");
    expect(policy.lastConfirmedAt?.toISOString()).toBe(plus(cycle.dueAt, 30).toISOString());
    expect(policy.nextCheckAt.toISOString()).toBe(plus(cycle.dueAt, 60).toISOString());
    expect(policy.confirmationDeadline).toBeNull();
    const audit = await app.prisma.auditEvent.findFirst({ where: { action: "check_in.escalation_cancelled" } });
    expect(audit).toBeTruthy();
    await runWorkerTick(app.prisma, { simulated: true });
    expect(await app.prisma.notificationDelivery.count({ where: { templateId: "check_in_escalation" } })).toBe(1);
    expect(await app.prisma.releaseJob.count()).toBe(0);
  });

  it("rejects an expired confirmation token", async () => {
    const author = await registerUser(app, "expired@example.test", "Expired Author");
    await verifyEmail(app, author.cookie, author.token);
    const raw = "expired-token-value-0123456789";
    await app.prisma.checkInConfirmationToken.create({
      data: {
        userId: author.body.user.id,
        tokenHash: sha256(raw),
        expiresAt: new Date("2020-01-01T00:00:00.000Z"),
      },
    });
    await setClock(new Date("2026-06-01T00:00:00.000Z"));
    const response = await app.inject({
      method: "POST",
      url: "/v1/check-in/confirm",
      payload: { token: raw },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe("TOKEN_EXPIRED");
  });

  it("retries a failed email once and does not create a second notification", async () => {
    const author = await registerUser(app, "retry@example.test", "Retry Author");
    await verifyEmail(app, author.cookie, author.token);
    const cycle = await app.prisma.checkInCycle.findFirstOrThrow({ where: { userId: author.body.user.id, state: "due" } });
    await setClock(cycle.dueAt);
    process.env.DIGI_EMAIL_FAIL = "true";
    const failed = await runWorkerTick(app.prisma, { simulated: true });
    expect(failed.remindersSent).toBe(0);
    expect(await app.prisma.notificationDelivery.count({ where: { templateId: "check_in_due", channel: "email" } })).toBe(1);
    expect(await app.prisma.notificationDelivery.findFirst({ where: { templateId: "check_in_due", channel: "email" } })).toMatchObject({
      status: "failed",
    });
    process.env.DIGI_EMAIL_FAIL = "false";
    await setClock(new Date(cycle.dueAt.getTime() + 60_000));
    const retried = await runWorkerTick(app.prisma, { simulated: true });
    expect(retried.remindersSent).toBe(1);
    const rows = await app.prisma.notificationDelivery.findMany({ where: { templateId: "check_in_due", channel: "email" } });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.status).toBe("sent");
    const third = await runWorkerTick(app.prisma, { simulated: true });
    expect(third.remindersSent).toBe(0);
    expect(await app.prisma.notificationDelivery.count({ where: { templateId: "check_in_due", channel: "email" } })).toBe(1);
  });

  it("lets two workers process one account only once", async () => {
    const author = await registerUser(app, "race@example.test", "Race Author");
    await verifyEmail(app, author.cookie, author.token);
    const cycle = await app.prisma.checkInCycle.findFirstOrThrow({ where: { userId: author.body.user.id, state: "due" } });
    await setClock(cycle.dueAt);
    const [first, second] = await Promise.all([
      runWorkerTick(app.prisma, { simulated: true }),
      runWorkerTick(app.prisma, { simulated: true }),
    ]);
    expect(first.remindersSent + second.remindersSent).toBe(1);
    expect(await app.prisma.notificationDelivery.count({ where: { templateId: "check_in_due", channel: "email" } })).toBe(1);
    expect(await app.prisma.checkInEvent.count({ where: { cycleId: cycle.id, type: "notice_sent" } })).toBe(1);
  });

  it("stores the deadline in UTC and writes the account time zone in the email", async () => {
    const author = await registerUser(app, "zone@example.test", "Zone Author");
    await verifyEmail(app, author.cookie, author.token);
    await app.prisma.profile.update({ where: { userId: author.body.user.id }, data: { timeZone: "Asia/Karachi" } });
    const cycle = await app.prisma.checkInCycle.findFirstOrThrow({ where: { userId: author.body.user.id, state: "due" } });
    await setClock(cycle.dueAt);
    await runWorkerTick(app.prisma, { simulated: true });
    const policy = await app.prisma.checkInPolicy.findUniqueOrThrow({ where: { userId: author.body.user.id } });
    expect(policy.confirmationDeadline?.toISOString()).toBe(plus(cycle.dueAt, 30).toISOString());
    const message = await app.prisma.devMessage.findFirstOrThrow({
      where: { templateId: "check_in_due", destination: "zone@example.test" },
    });
    const variables = message.variables as { timeZone: string; utcDeadline: string; localDeadline: string; text: string };
    expect(variables.timeZone).toBe("Asia/Karachi");
    expect(variables.utcDeadline).toBe(plus(cycle.dueAt, 30).toISOString());
    const local = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Karachi",
      day: "numeric",
      month: "long",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).format(plus(cycle.dueAt, 30));
    const utc = new Intl.DateTimeFormat("en-GB", {
      timeZone: "UTC",
      day: "numeric",
      month: "long",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).format(plus(cycle.dueAt, 30));
    expect(variables.localDeadline).toBe(local);
    expect(local).not.toBe(utc);
    expect(variables.text).toContain(local);
    expect(variables.text).toContain(variables.utcDeadline);
  });
});
