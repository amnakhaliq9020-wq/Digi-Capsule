import { checkInNoticeKey } from "@digi/domain";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { capturedMail } from "../lib/mail";
import { enqueueNotice } from "../lib/notify";
import { sendDueCheckInNotices } from "../services/check-in-notices";
import { runWorkerTick } from "../services/worker-tick";
import { createApp, registerUser, resetDatabase, verifyEmail } from "./helpers";

const app = await createApp();
afterAll(async () => app.close());

beforeEach(async () => {
  process.env.NODE_ENV = "test";
  process.env.DIGI_TEST_MODE = "true";
  process.env.DIGI_EMAIL_FAIL = "false";
  delete process.env.DIGI_SMTP_RESULT;
  delete process.env.DIGI_DELIVERY_LEASE_MS;
  capturedMail.length = 0;
  await resetDatabase(app);
});

afterEach(() => {
  delete process.env.DIGI_SMTP_RESULT;
  delete process.env.DIGI_EMAIL_FAIL;
  delete process.env.DIGI_DELIVERY_LEASE_MS;
});

async function setClock(instant: Date) {
  await app.prisma.devClock.upsert({
    where: { id: 1 },
    create: { id: 1, simulatedNow: instant },
    update: { simulatedNow: instant },
  });
}

async function dueAccount() {
  const email = `outbox-${Date.now()}-${Math.random().toString(16).slice(2)}@example.test`;
  const registered = await registerUser(app, email);
  await verifyEmail(app, registered.cookie, registered.token);
  const user = await app.prisma.user.findUniqueOrThrow({ where: { email }, include: { checkInPolicy: true } });
  const cycle = await app.prisma.checkInCycle.findFirstOrThrow({ where: { userId: user.id, state: "due" } });
  const dueAt = new Date("2026-08-01T00:00:00.000Z");
  await app.prisma.checkInCycle.update({ where: { id: cycle.id }, data: { dueAt, state: "due" } });
  await setClock(dueAt);
  return { registered, user, cycle, dueAt, email };
}

describe("check-in outbox", () => {
  it("rolls the reserved warning back when the transaction fails", async () => {
    const { user, cycle } = await dueAccount();
    const key = checkInNoticeKey({
      userId: user.id,
      cycleId: cycle.id,
      generation: user.checkInPolicy?.warningGeneration ?? 1,
      kind: "missed_check_in",
      channel: "email",
    });
    await expect(app.prisma.$transaction(async (tx) => {
      await enqueueNotice(tx, {
        to: user.email!,
        templateId: "check_in_due",
        variables: { authorName: "there", stage: "missed_check_in", channel: "email" },
        idempotencyKey: key,
        relatedType: "check_in_cycle",
        relatedId: cycle.id,
        userId: user.id,
        generation: user.checkInPolicy?.warningGeneration ?? 1,
        now: cycle.dueAt,
      });
      throw new Error("simulated rollback");
    })).rejects.toThrow("simulated rollback");
    expect(await app.prisma.notificationDelivery.count({ where: { idempotencyKey: key } })).toBe(0);
  });

  it("sends a committed warning once after the worker resumes", async () => {
    const { user, cycle, dueAt } = await dueAccount();
    const generation = user.checkInPolicy?.warningGeneration ?? 1;
    const key = checkInNoticeKey({ userId: user.id, cycleId: cycle.id, generation, kind: "missed_check_in", channel: "email" });
    await enqueueNotice(app.prisma, {
      to: user.email!,
      templateId: "check_in_due",
      variables: { authorName: "there", stage: "missed_check_in", channel: "email", link: "https://example.test/check-in/confirm?token=already-saved" },
      idempotencyKey: key,
      relatedType: "check_in_cycle",
      relatedId: cycle.id,
      userId: user.id,
      generation,
      now: dueAt,
    });
    const first = await runWorkerTick(app.prisma, { simulated: true, ownerUserId: user.id, workerId: "resume-a" });
    expect(first.remindersSent).toBe(1);
    expect(await app.prisma.devMessage.count({ where: { templateId: "check_in_due", destination: user.email! } })).toBe(1);
    const second = await runWorkerTick(app.prisma, { simulated: true, ownerUserId: user.id, workerId: "resume-b" });
    expect(second.remindersSent).toBe(0);
    expect(await app.prisma.devMessage.count({ where: { templateId: "check_in_due", destination: user.email! } })).toBe(1);
    expect(await app.prisma.notificationDelivery.count({ where: { idempotencyKey: key, status: "sent" } })).toBe(1);
  });

  it("lets only one of two workers send the warning", async () => {
    const { user } = await dueAccount();
    const [left, right] = await Promise.all([
      runWorkerTick(app.prisma, { simulated: true, ownerUserId: user.id, workerId: "check-a" }),
      runWorkerTick(app.prisma, { simulated: true, ownerUserId: user.id, workerId: "check-b" }),
    ]);
    expect(left.remindersSent + right.remindersSent).toBe(1);
    expect(await app.prisma.devMessage.count({ where: { templateId: "check_in_due", destination: user.email! } })).toBe(1);
    expect(await app.prisma.checkInEvent.count({ where: { type: "notice_sent" } })).toBe(1);
  });

  it("marks an SMTP timeout uncertain and does not send it again", async () => {
    const { user } = await dueAccount();
    process.env.DIGI_SMTP_RESULT = "ambiguous";
    await runWorkerTick(app.prisma, { simulated: true, ownerUserId: user.id, workerId: "timeout-a" });
    expect(capturedMail).toHaveLength(1);
    const notice = await app.prisma.notificationDelivery.findFirstOrThrow({ where: { templateId: "check_in_due", channel: "email" } });
    expect(notice.status).toBe("uncertain");
    expect(notice.retryable).toBe(false);
    delete process.env.DIGI_SMTP_RESULT;
    await runWorkerTick(app.prisma, { simulated: true, ownerUserId: user.id, workerId: "timeout-b" });
    expect(capturedMail).toHaveLength(1);
    expect(await app.prisma.notificationDelivery.count({ where: { templateId: "check_in_due", channel: "email" } })).toBe(1);
  });

  it("cancels a pending warning when the person checks in", async () => {
    const { registered, user, cycle } = await dueAccount();
    const generation = user.checkInPolicy?.warningGeneration ?? 1;
    const key = checkInNoticeKey({ userId: user.id, cycleId: cycle.id, generation, kind: "second_warning", channel: "email" });
    await enqueueNotice(app.prisma, {
      to: user.email!,
      templateId: "check_in_reminder",
      variables: { authorName: "there", stage: "second_warning", channel: "email" },
      idempotencyKey: key,
      relatedType: "check_in_cycle",
      relatedId: cycle.id,
      userId: user.id,
      generation,
      now: cycle.dueAt,
    });
    const response = await app.inject({
      method: "POST",
      url: "/v1/check-in",
      headers: { cookie: registered.cookie },
    });
    expect(response.statusCode).toBe(200);
    const cancelled = await app.prisma.notificationDelivery.findUniqueOrThrow({ where: { idempotencyKey: key } });
    expect(cancelled.status).toBe("cancelled");
    expect(cancelled.payload).toBeNull();
    await runWorkerTick(app.prisma, { simulated: true, ownerUserId: user.id, workerId: "after-check-in" });
    expect(await app.prisma.devMessage.count({ where: { templateId: "check_in_reminder" } })).toBe(0);
    expect(await app.prisma.notificationDelivery.count({ where: { idempotencyKey: key, status: "cancelled" } })).toBe(1);
  });

  it("sends a warning once when the worker crashed before contacting the provider", async () => {
    const { user, cycle, dueAt } = await dueAccount();
    process.env.DIGI_DELIVERY_LEASE_MS = "0";
    const generation = user.checkInPolicy?.warningGeneration ?? 1;
    const key = checkInNoticeKey({ userId: user.id, cycleId: cycle.id, generation, kind: "missed_check_in", channel: "email" });
    await app.prisma.notificationDelivery.create({
      data: {
        idempotencyKey: key,
        channel: "email",
        templateId: "check_in_due",
        destinationHash: "claimed",
        status: "processing",
        relatedType: "check_in_cycle",
        relatedId: cycle.id,
        userId: user.id,
        generationId: generation,
        claimedAt: new Date(dueAt.getTime() - 1_000),
        payload: { to: user.email, authorName: "there", stage: "missed_check_in", channel: "email" },
      },
    });
    await runWorkerTick(app.prisma, { simulated: true, ownerUserId: user.id, workerId: "crashed-before-send" });
    expect(await app.prisma.devMessage.count({ where: { templateId: "check_in_due", destination: user.email! } })).toBe(1);
    await runWorkerTick(app.prisma, { simulated: true, ownerUserId: user.id, workerId: "crashed-before-send-again" });
    expect(await app.prisma.devMessage.count({ where: { templateId: "check_in_due", destination: user.email! } })).toBe(1);
  });

  it("does not resend a warning after the provider call may have started", async () => {
    const { user, cycle, dueAt } = await dueAccount();
    process.env.DIGI_DELIVERY_LEASE_MS = "0";
    const generation = user.checkInPolicy?.warningGeneration ?? 1;
    const key = checkInNoticeKey({ userId: user.id, cycleId: cycle.id, generation, kind: "missed_check_in", channel: "email" });
    await app.prisma.notificationDelivery.create({
      data: {
        idempotencyKey: key,
        channel: "email",
        templateId: "check_in_due",
        destinationHash: "started",
        status: "processing",
        relatedType: "check_in_cycle",
        relatedId: cycle.id,
        userId: user.id,
        generationId: generation,
        claimedAt: new Date(dueAt.getTime() - 1_000),
        dispatchStartedAt: dueAt,
        payload: { to: user.email, authorName: "there", stage: "missed_check_in", channel: "email" },
      },
    });
    await runWorkerTick(app.prisma, { simulated: true, ownerUserId: user.id, workerId: "uncertain-a" });
    const notice = await app.prisma.notificationDelivery.findUniqueOrThrow({ where: { idempotencyKey: key } });
    expect(notice.status).toBe("uncertain");
    expect(notice.payload).toBeNull();
    expect(await app.prisma.devMessage.count({ where: { templateId: "check_in_due" } })).toBe(0);
    await runWorkerTick(app.prisma, { simulated: true, ownerUserId: user.id, workerId: "uncertain-b" });
    expect(await app.prisma.devMessage.count({ where: { templateId: "check_in_due" } })).toBe(0);
  });

  it("keeps the same key when a failed warning is retried", async () => {
    const { user, cycle, dueAt } = await dueAccount();
    process.env.DIGI_EMAIL_FAIL = "true";
    await sendDueCheckInNotices(app.prisma, cycle.id, dueAt, "retry-a");
    delete process.env.DIGI_EMAIL_FAIL;
    const failed = await app.prisma.notificationDelivery.findFirstOrThrow({ where: { templateId: "check_in_due", channel: "email" } });
    expect(failed.status).toBe("failed");
    await sendDueCheckInNotices(app.prisma, cycle.id, new Date(dueAt.getTime() + 60_000), "retry-b");
    const retried = await app.prisma.notificationDelivery.findMany({ where: { idempotencyKey: failed.idempotencyKey } });
    expect(retried).toHaveLength(1);
    expect(retried[0]?.status).toBe("sent");
    expect(await app.prisma.devMessage.count({ where: { templateId: "check_in_due", destination: user.email! } })).toBe(1);
  });
});
