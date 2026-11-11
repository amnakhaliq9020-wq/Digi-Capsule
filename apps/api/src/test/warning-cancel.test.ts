import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { deliverEmail } from "../lib/notify";
import { maySendLiveSms } from "../lib/sms";
import { runWorkerTick } from "../services/worker-tick";
import { createApp, registerUser, resetDatabase, verifyEmail } from "./helpers";

const app = await createApp();
afterAll(async () => app.close());

beforeEach(async () => {
  process.env.NODE_ENV = "test";
  process.env.DIGI_TEST_MODE = "true";
  process.env.DIGI_SMS_FAIL = "false";
  process.env.DIGI_EMAIL_FAIL = "false";
  await resetDatabase(app);
});

describe("warning cancellation", () => {
  it("cancels the open cycle and discards an old warning after check-in", async () => {
    const author = await registerUser(app, "cancel-warn@example.test", "Cancel Author");
    await verifyEmail(app, author.cookie, author.token);
    const cycle = await app.prisma.checkInCycle.findFirstOrThrow({ where: { userId: author.body.user.id, state: "due" } });
    await app.prisma.devClock.upsert({
      where: { id: 1 },
      create: { id: 1, simulatedNow: cycle.dueAt },
      update: { simulatedNow: cycle.dueAt },
    });
    const first = await runWorkerTick(app.prisma, { simulated: true });
    expect(first.remindersSent).toBe(1);
    await app.prisma.notificationDelivery.create({
      data: {
        userId: author.body.user.id,
        idempotencyKey: "stale-warning",
        channel: "email",
        templateId: "check_in_reminder",
        destinationHash: "stale",
        status: "pending",
        relatedType: "check_in_cycle",
        relatedId: cycle.id,
        generationId: 1,
      },
    });
    const alive = await app.inject({ method: "POST", url: "/v1/check-in", headers: { cookie: author.cookie } });
    expect(alive.statusCode).toBe(200);
    const policy = await app.prisma.checkInPolicy.findUniqueOrThrow({ where: { userId: author.body.user.id } });
    expect(policy.accountCheckStatus).toBe("on_time");
    expect(policy.warningGeneration).toBe(2);
    expect(policy.nextCheckAt.getTime() - policy.lastConfirmedAt!.getTime()).toBe(30 * 24 * 60 * 60 * 1000);
    const stale = await app.prisma.notificationDelivery.findUniqueOrThrow({ where: { idempotencyKey: "stale-warning" } });
    expect(stale.status).toBe("cancelled");
    const replay = await deliverEmail(app.prisma, {
      to: "cancel-warn@example.test",
      templateId: "check_in_reminder",
      variables: { channel: "email", authorName: "Cancel Author" },
      idempotencyKey: "late-worker",
      relatedType: "check_in_cycle",
      relatedId: cycle.id,
      userId: author.body.user.id,
      generation: 1,
    });
    expect(replay.status).toBe("cancelled");
    const second = await runWorkerTick(app.prisma, { simulated: true });
    expect(second.remindersSent).toBe(0);
    expect(await app.prisma.notificationDelivery.count({ where: { templateId: "check_in_due", channel: "email", status: "sent" } })).toBe(1);
    const audit = await app.prisma.auditEvent.findFirst({ where: { action: "check_in.warnings_cancelled" } });
    expect(audit).toBeTruthy();
  });

  it("does not text a person who opted out or has no international number", () => {
    expect(maySendLiveSms({ phone: "+15551234567", channelEnabled: false, consentActive: true })).toBe(false);
    expect(maySendLiveSms({ phone: "+15551234567", channelEnabled: true, consentActive: false })).toBe(false);
    expect(maySendLiveSms({ phone: "5551234567", channelEnabled: true, consentActive: true })).toBe(false);
    expect(maySendLiveSms({ phone: "+15551234567", channelEnabled: true, consentActive: true })).toBe(false);
  });

  it("retries a failed SMS without creating a second row", async () => {
    const author = await registerUser(app, "sms-retry@example.test", "SMS Author");
    process.env.DIGI_SMS_FAIL = "true";
    const failed = await deliverEmail(app.prisma, {
      to: "+15551234567",
      channel: "sms",
      templateId: "check_in_due",
      variables: { channel: "sms", authorName: "SMS Author" },
      idempotencyKey: "sms-retry-row",
      relatedType: "check_in_cycle",
      relatedId: author.body.user.id,
      userId: author.body.user.id,
    });
    expect(failed.status).toBe("failed");
    process.env.DIGI_SMS_FAIL = "false";
    const retried = await deliverEmail(app.prisma, {
      to: "+15551234567",
      channel: "sms",
      templateId: "check_in_due",
      variables: { channel: "sms", authorName: "SMS Author" },
      idempotencyKey: "sms-retry-row",
      relatedType: "check_in_cycle",
      relatedId: author.body.user.id,
      userId: author.body.user.id,
    });
    expect(retried.status).toBe("sent");
    expect(await app.prisma.notificationDelivery.count({ where: { idempotencyKey: "sms-retry-row" } })).toBe(1);
  });
});
