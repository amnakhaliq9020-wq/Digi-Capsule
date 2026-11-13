import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { calendarJobKey, exactInstant } from "@digi/domain";
import { capturedMail } from "../lib/mail";
import { retryDelayMs } from "../lib/delivery-policy";
import { addVerifiedContact, createApp, registerUser, resetDatabase, verifyEmail } from "./helpers";
import { recoverStuckDeliveries, runWorkerTick } from "../services/worker-tick";

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
  delete process.env.DIGI_DELIVERY_LEASE_MS;
  process.env.DIGI_EMAIL_FAIL = "false";
});

async function setClock(cookie: string, simulatedNow: string) {
  const response = await app.inject({
    method: "POST",
    url: "/v1/dev/clock",
    headers: { cookie },
    payload: { simulatedNow },
  });
  expect(response.statusCode).toBe(200);
}

async function scheduledMemory() {
  const recipient = await registerUser(app, "once.recipient@example.test", "Sam");
  await verifyEmail(app, recipient.cookie, recipient.token);
  const author = await registerUser(app, "once.author@example.test", "Author");
  await verifyEmail(app, author.cookie, author.token);
  const contact = await addVerifiedContact(app, author.cookie, { displayName: "Sam", email: "once.recipient@example.test" });
  await setClock(author.cookie, "2026-08-01T00:00:00.000Z");
  const created = await app.inject({
    method: "POST",
    url: "/v1/memories",
    headers: { cookie: author.cookie },
    payload: { title: "Once", body: "PRIVATE_ONCE" },
  });
  const id = created.json().memory.id as string;
  const saved = await app.inject({
    method: "POST",
    url: `/v1/memories/${id}/schedule`,
    headers: { cookie: author.cookie },
    payload: { mode: "on_date", localDate: "2026-08-02", localTime: "09:00", timeZone: "UTC", recipientIds: [contact.id] },
  });
  expect(saved.statusCode).toBe(200);
  return { author, recipient, contact, id, when: "2026-08-02T09:00:00.000Z" };
}

describe("exactly-once delivery effects", () => {
  it("uses exponential backoff and stops a permanent rejection", () => {
    expect(retryDelayMs(1)).toBe(60_000);
    expect(retryDelayMs(2)).toBe(120_000);
    expect(retryDelayMs(3)).toBe(240_000);
    expect(retryDelayMs(12)).toBe(60 * 60_000);
  });

  it("does not send a second email or grant access when a successful job is repeated", async () => {
    const { author, recipient, id, when } = await scheduledMemory();
    await setClock(author.cookie, when);
    const first = await runWorkerTick(app.prisma, { simulated: true, workerId: "worker-a" });
    const second = await runWorkerTick(app.prisma, { simulated: true, workerId: "worker-b" });
    expect(first.calendarJobsSent).toBe(1);
    expect(second.calendarJobsSent).toBe(0);
    expect(await app.prisma.releaseJob.count({ where: { capsuleItemId: id, status: "sent" } })).toBe(1);
    expect(await app.prisma.notificationDelivery.count({ where: { templateId: "memory_ready" } })).toBe(1);
    expect(await app.prisma.devMessage.count({ where: { templateId: "memory_ready" } })).toBe(1);
    const notice = await app.prisma.notificationDelivery.findFirstOrThrow({ where: { templateId: "memory_ready" } });
    expect(notice.providerMessageId).toBeTruthy();
    expect(notice.status).toBe("sent");
    expect(notice.providerResponse).toBe("console_accepted");
    const open = await app.inject({ method: "GET", url: `/v1/memories/${id}`, headers: { cookie: recipient.cookie } });
    expect(open.statusCode).toBe(200);
    const again = await app.inject({ method: "GET", url: `/v1/memories/${id}`, headers: { cookie: recipient.cookie } });
    expect(again.statusCode).toBe(200);
    expect(await app.prisma.devMessage.count({ where: { templateId: "memory_ready" } })).toBe(1);
  });

  it("lets two workers claim one memory only once", async () => {
    const { author, id, when } = await scheduledMemory();
    await setClock(author.cookie, when);
    const raced = await Promise.all([
      runWorkerTick(app.prisma, { simulated: true, workerId: "worker-a" }),
      runWorkerTick(app.prisma, { simulated: true, workerId: "worker-b" }),
    ]);
    expect(raced.reduce((sum, result) => sum + result.calendarJobsSent, 0)).toBe(1);
    expect(await app.prisma.releaseJob.count({ where: { capsuleItemId: id } })).toBe(1);
    expect(await app.prisma.devMessage.count({ where: { templateId: "memory_ready" } })).toBe(1);
  });

  it("retries a temporary failure after the backoff and does not retry a permanent rejection", async () => {
    const { author, id, when } = await scheduledMemory();
    await setClock(author.cookie, when);
    process.env.DIGI_SMTP_RESULT = "temporary";
    const failed = await runWorkerTick(app.prisma, { simulated: true, workerId: "worker-a" });
    expect(failed.calendarJobsSent).toBe(0);
    expect(capturedMail).toHaveLength(0);
    const waiting = await app.prisma.releaseJob.findFirstOrThrow({ where: { capsuleItemId: id } });
    expect(waiting.status).toBe("failed");
    expect(waiting.nextAttemptAt?.toISOString()).toBe("2026-08-02T09:01:00.000Z");
    const tooSoon = await runWorkerTick(app.prisma, { simulated: true, workerId: "worker-a" });
    expect(tooSoon.calendarJobsSent).toBe(0);
    delete process.env.DIGI_SMTP_RESULT;
    await setClock(author.cookie, "2026-08-02T09:01:00.000Z");
    const retried = await runWorkerTick(app.prisma, { simulated: true, workerId: "worker-a" });
    expect(retried.calendarJobsSent).toBe(1);
    expect(await app.prisma.notificationDelivery.count({ where: { templateId: "memory_ready" } })).toBe(1);
    expect(await app.prisma.devMessage.count({ where: { templateId: "memory_ready" } })).toBe(1);

    const created = await app.inject({
      method: "POST",
      url: "/v1/memories",
      headers: { cookie: author.cookie },
      payload: { title: "Rejected", body: "NO_SEND" },
    });
    const rejectedId = created.json().memory.id as string;
    const contact = await app.prisma.person.findFirstOrThrow({ where: { email: "once.recipient@example.test" } });
    await setClock(author.cookie, "2026-08-01T00:00:00.000Z");
    await app.inject({
      method: "POST",
      url: `/v1/memories/${rejectedId}/schedule`,
      headers: { cookie: author.cookie },
      payload: { mode: "on_date", localDate: "2026-08-03", localTime: "09:00", timeZone: "UTC", recipientIds: [contact.id] },
    });
    await setClock(author.cookie, "2026-08-03T09:00:00.000Z");
    process.env.DIGI_SMTP_RESULT = "permanent";
    const rejected = await runWorkerTick(app.prisma, { simulated: true, workerId: "worker-a" });
    expect(rejected.calendarJobsSent).toBe(0);
    expect(capturedMail).toHaveLength(0);
    const dead = await app.prisma.releaseJob.findFirstOrThrow({ where: { capsuleItemId: rejectedId } });
    expect(dead.status).toBe("dead");
    expect(dead.retryable).toBe(false);
    delete process.env.DIGI_SMTP_RESULT;
    await setClock(author.cookie, "2026-08-04T09:00:00.000Z");
    const stopped = await runWorkerTick(app.prisma, { simulated: true, workerId: "worker-a" });
    expect(stopped.calendarJobsSent).toBe(0);
    expect(await app.prisma.devMessage.count({ where: { templateId: "memory_ready" } })).toBe(1);
  });

  it("does not resend after an ambiguous SMTP timeout", async () => {
    const { author, recipient, id, when } = await scheduledMemory();
    await setClock(author.cookie, when);
    process.env.DIGI_SMTP_RESULT = "ambiguous";
    const timedOut = await runWorkerTick(app.prisma, { simulated: true, workerId: "worker-a" });
    expect(timedOut.calendarJobsSent).toBe(0);
    expect(capturedMail).toHaveLength(1);
    const job = await app.prisma.releaseJob.findFirstOrThrow({ where: { capsuleItemId: id } });
    expect(job.status).toBe("uncertain");
    expect(job.providerMessageId).toBeNull();
    const notice = await app.prisma.notificationDelivery.findFirstOrThrow({ where: { templateId: "memory_ready" } });
    expect(notice.status).toBe("uncertain");
    expect(notice.idempotencyKey).toBe(`memory-ready:${id}:${job.personId}:${when}:g1`);
    delete process.env.DIGI_SMTP_RESULT;
    const again = await runWorkerTick(app.prisma, { simulated: true, workerId: "worker-b" });
    expect(again.calendarJobsSent).toBe(0);
    expect(capturedMail).toHaveLength(1);
    expect(await app.prisma.devMessage.count({ where: { templateId: "memory_ready" } })).toBe(0);
    const hidden = await app.inject({ method: "GET", url: `/v1/memories/${id}`, headers: { cookie: recipient.cookie } });
    expect(hidden.statusCode).toBe(404);
  });

  it("recovers a crashed dispatch as uncertain instead of sending again", async () => {
    const { author, id, contact, when } = await scheduledMemory();
    const occurrence = exactInstant("2026-08-02", "09:00", "UTC");
    const rule = await app.prisma.releaseRule.findFirstOrThrow({ where: { capsuleItemId: id, status: "active" } });
    const claimedAt = new Date("2026-08-02T08:00:00.000Z");
    await app.prisma.releaseJob.create({
      data: {
        idempotencyKey: calendarJobKey(id, contact.id, occurrence.toISOString(), 1),
        scheduleGeneration: 1,
        releaseRuleId: rule.id,
        capsuleItemId: id,
        personId: contact.id,
        occurrenceAt: occurrence,
        status: "processing",
        attemptCount: 1,
        workerId: "worker-crashed",
        claimedAt,
        dispatchStartedAt: claimedAt,
      },
    });
    await setClock(author.cookie, when);
    process.env.DIGI_DELIVERY_LEASE_MS = "0";
    await recoverStuckDeliveries(app.prisma, new Date(when), "worker-recovery");
    const recovered = await app.prisma.releaseJob.findFirstOrThrow({ where: { capsuleItemId: id } });
    expect(recovered.status).toBe("uncertain");
    const tick = await runWorkerTick(app.prisma, { simulated: true, workerId: "worker-recovery" });
    expect(tick.calendarJobsSent).toBe(0);
    expect(await app.prisma.devMessage.count({ where: { templateId: "memory_ready" } })).toBe(0);
    expect(await app.prisma.releaseJob.count({ where: { capsuleItemId: id } })).toBe(1);
  });

  it("does not let a cancelled memory or an old date send", async () => {
    const { author, id, contact, when } = await scheduledMemory();
    const moved = await app.inject({
      method: "POST",
      url: `/v1/memories/${id}/schedule`,
      headers: { cookie: author.cookie },
      payload: { mode: "on_date", localDate: "2026-08-04", localTime: "09:00", timeZone: "UTC", recipientIds: [contact.id] },
    });
    expect(moved.json().memory.schedule.localDate).toBe("2026-08-04");
    await setClock(author.cookie, when);
    expect((await runWorkerTick(app.prisma, { simulated: true })).calendarJobsSent).toBe(0);
    const cancelled = await app.inject({ method: "POST", url: `/v1/memories/${id}/cancel`, headers: { cookie: author.cookie } });
    expect(cancelled.json().memory.status).toBe("draft");
    await setClock(author.cookie, "2026-08-04T09:00:00.000Z");
    expect((await runWorkerTick(app.prisma, { simulated: true })).calendarJobsSent).toBe(0);
    expect(await app.prisma.releaseJob.count({ where: { status: "sent" } })).toBe(0);
  });
});
