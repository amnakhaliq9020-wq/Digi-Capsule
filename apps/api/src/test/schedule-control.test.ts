import { exactInstant } from "@digi/domain";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { capturedMail } from "../lib/mail";
import { runWorkerTick } from "../services/worker-tick";
import { addVerifiedContact, createApp, registerUser, resetDatabase, verifyEmail } from "./helpers";

const app = await createApp();
afterAll(async () => app.close());

beforeEach(async () => {
  process.env.NODE_ENV = "test";
  process.env.DIGI_TEST_MODE = "true";
  process.env.DIGI_EMAIL_FAIL = "false";
  delete process.env.DIGI_SMTP_RESULT;
  capturedMail.length = 0;
  await resetDatabase(app);
});

afterEach(() => {
  delete process.env.DIGI_SMTP_RESULT;
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

async function setZone(cookie: string, timeZone: string) {
  const response = await app.inject({
    method: "PATCH",
    url: "/v1/auth/me",
    headers: { cookie },
    payload: { timeZone },
  });
  expect(response.statusCode).toBe(200);
}

async function readyPair() {
  const recipient = await registerUser(app, "sam.schedule@example.test", "Sam");
  await verifyEmail(app, recipient.cookie, recipient.token);
  const author = await registerUser(app, "author.schedule@example.test", "Author");
  await verifyEmail(app, author.cookie, author.token);
  const contact = await addVerifiedContact(app, author.cookie, { displayName: "Sam", email: "sam.schedule@example.test" });
  return { author, recipient, contact };
}

async function createMemory(cookie: string) {
  const created = await app.inject({
    method: "POST",
    url: "/v1/memories",
    headers: { cookie },
    payload: { title: "Keep this letter", body: "PRIVATE_SCHEDULE_LETTER" },
  });
  expect(created.statusCode).toBe(201);
  return created.json().memory.id as string;
}

function schedule(cookie: string, id: string, recipientId: string, localDate: string, localTime = "09:00", timeZone = "UTC") {
  return app.inject({
    method: "POST",
    url: `/v1/memories/${id}/schedule`,
    headers: { cookie },
    payload: { mode: "on_date", localDate, localTime, timeZone, recipientIds: [recipientId] },
  });
}

describe("scheduled delivery changes", () => {
  it("replaces the date, cancels the old schedule, and ignores the old job", async () => {
    const { author, contact } = await readyPair();
    await setClock(author.cookie, "2026-08-01T00:00:00.000Z");
    const id = await createMemory(author.cookie);
    const first = await schedule(author.cookie, id, contact.id, "2026-08-02");
    expect(first.statusCode).toBe(200);
    expect(first.json().memory.scheduleGeneration).toBe(1);
    const moved = await schedule(author.cookie, id, contact.id, "2026-08-04", "10:30");
    expect(moved.statusCode).toBe(200);
    expect(moved.json().memory.schedule.localDate).toBe("2026-08-04");
    expect(moved.json().memory.schedule.localTime).toBe("10:30");
    expect(moved.json().memory.scheduleGeneration).toBe(2);
    expect(moved.json().memory.status).toBe("scheduled");
    expect(moved.json().memory.body).toBe("PRIVATE_SCHEDULE_LETTER");
    const rules = await app.prisma.releaseRule.findMany({ where: { capsuleItemId: id }, orderBy: { createdAt: "asc" } });
    expect(rules.filter((rule) => rule.status === "cancelled")).toHaveLength(1);
    expect(rules.filter((rule) => rule.status === "active")).toHaveLength(1);
    await setClock(author.cookie, "2026-08-02T09:00:00.000Z");
    const oldTick = await runWorkerTick(app.prisma, { simulated: true, ownerUserId: author.body.user.id, workerId: "old-date" });
    expect(oldTick.calendarJobsSent).toBe(0);
    expect(await app.prisma.devMessage.count({ where: { templateId: "memory_ready" } })).toBe(0);
    const repeated = await schedule(author.cookie, id, contact.id, "2026-08-04", "10:30");
    expect(repeated.json().alreadyApplied).toBe(true);
    expect(repeated.json().memory.scheduleGeneration).toBe(2);
    expect(await app.prisma.releaseRule.count({ where: { capsuleItemId: id, status: "active" } })).toBe(1);
  });

  it("uses the recipient time zone for the replacement date", async () => {
    const { author, recipient, contact } = await readyPair();
    await setZone(recipient.cookie, "Asia/Karachi");
    await setClock(author.cookie, "2026-07-01T00:00:00.000Z");
    const id = await createMemory(author.cookie);
    const saved = await schedule(author.cookie, id, contact.id, "2026-07-15", "09:00", "UTC");
    expect(saved.json().memory.recipientDeliveries[0].timeZone).toBe("Asia/Karachi");
    expect(saved.json().memory.schedule.nextRunAt).toBe(exactInstant("2026-07-15", "09:00", "Asia/Karachi").toISOString());
  });

  it("can change the recipient and keeps one active schedule", async () => {
    const { author, contact } = await readyPair();
    const other = await addVerifiedContact(app, author.cookie, {
      displayName: "Nia",
      email: "nia.schedule@example.test",
      phone: "+1 555 010 0199",
    });
    await setClock(author.cookie, "2026-08-01T00:00:00.000Z");
    const id = await createMemory(author.cookie);
    await schedule(author.cookie, id, contact.id, "2026-08-02");
    const moved = await schedule(author.cookie, id, other.id, "2026-08-05");
    expect(moved.statusCode).toBe(200);
    expect(moved.json().memory.recipients.map((person: { id: string }) => person.id)).toEqual([other.id]);
    const oldGrant = await app.prisma.itemGrant.findFirstOrThrow({ where: { capsuleItemId: id, personId: contact.id } });
    expect(oldGrant.revokedAt).toBeTruthy();
    expect(await app.prisma.releaseRule.count({ where: { capsuleItemId: id, status: "active" } })).toBe(1);
  });

  it("cancels a delivery without deleting the memory, and a later job sends nothing", async () => {
    const { author, recipient, contact } = await readyPair();
    await setClock(author.cookie, "2026-08-01T00:00:00.000Z");
    const id = await createMemory(author.cookie);
    await schedule(author.cookie, id, contact.id, "2026-08-02");
    const before = await app.prisma.capsuleItem.findUniqueOrThrow({ where: { id } });
    const cancelled = await app.inject({ method: "POST", url: `/v1/memories/${id}/cancel`, headers: { cookie: author.cookie } });
    expect(cancelled.statusCode).toBe(200);
    expect(cancelled.json().memory.status).toBe("draft");
    expect(cancelled.json().memory.body).toBe("PRIVATE_SCHEDULE_LETTER");
    expect(cancelled.json().message).toContain("still in your capsule");
    const again = await app.inject({ method: "POST", url: `/v1/memories/${id}/cancel`, headers: { cookie: author.cookie } });
    expect(again.json().alreadyApplied).toBe(true);
    expect(again.json().memory.scheduleGeneration).toBe(cancelled.json().memory.scheduleGeneration);
    const stored = await app.prisma.capsuleItem.findUniqueOrThrow({ where: { id } });
    expect(stored.status).toBe("draft");
    expect(stored.scheduleGeneration).toBe(before.scheduleGeneration + 1);
    await setClock(author.cookie, "2026-08-02T09:00:00.000Z");
    const tick = await runWorkerTick(app.prisma, { simulated: true, ownerUserId: author.body.user.id, workerId: "after-cancel" });
    expect(tick.calendarJobsSent).toBe(0);
    expect(await app.prisma.devMessage.count({ where: { templateId: "memory_ready" } })).toBe(0);
    const hidden = await app.inject({ method: "GET", url: `/v1/memories/${id}`, headers: { cookie: recipient.cookie } });
    expect(hidden.statusCode).toBe(404);
  });

  it("lets two workers overlap a reschedule without sending the old date", async () => {
    const { author, contact } = await readyPair();
    await setClock(author.cookie, "2026-08-02T08:00:00.000Z");
    const id = await createMemory(author.cookie);
    const saved = await schedule(author.cookie, id, contact.id, "2026-08-02");
    await setClock(author.cookie, "2026-08-02T09:00:00.000Z");
    expect(saved.statusCode).toBe(200);
    let releaseWorkers: () => void = () => undefined;
    const workersHolding = new Promise<void>((resolve) => {
      releaseWorkers = resolve;
    });
    let acquired: () => void = () => undefined;
    const lockHeld = new Promise<void>((resolve) => {
      acquired = resolve;
    });
    const holder = app.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT id FROM capsule_items WHERE id = ${id}::uuid FOR UPDATE`;
      acquired();
      await workersHolding;
      const now = new Date("2026-08-02T09:00:00.000Z");
      await tx.releaseRule.updateMany({
        where: { capsuleItemId: id, status: "active" },
        data: { status: "cancelled", cancelledAt: now, nextRunAt: null },
      });
      await tx.releaseJob.updateMany({
        where: { capsuleItemId: id, status: { in: ["pending", "failed", "processing", "sending"] }, dispatchStartedAt: null },
        data: { status: "cancelled", cancelledAt: now, lastError: "superseded", retryable: false },
      });
      await tx.capsuleItem.update({ where: { id }, data: { scheduleGeneration: { increment: 1 } } });
      await tx.releaseRule.create({
        data: {
          capsuleItemId: id,
          trigger: "exact_time",
          timeZone: "UTC",
          localDate: "2026-09-01",
          localTime: "09:00",
          nextRunAt: new Date("2026-09-01T09:00:00.000Z"),
          status: "active",
        },
      });
    }, { timeout: 20_000 });
    await lockHeld;
    const workers = Promise.all([
      runWorkerTick(app.prisma, { simulated: true, ownerUserId: author.body.user.id, workerId: "race-a" }),
      runWorkerTick(app.prisma, { simulated: true, ownerUserId: author.body.user.id, workerId: "race-b" }),
    ]);
    await new Promise((resolve) => setTimeout(resolve, 400));
    releaseWorkers();
    await holder;
    const [left, right] = await workers;
    expect(left.calendarJobsSent + right.calendarJobsSent).toBe(0);
    expect(await app.prisma.devMessage.count({ where: { templateId: "memory_ready" } })).toBe(0);
    expect(await app.prisma.releaseRule.count({ where: { capsuleItemId: id, status: "active" } })).toBe(1);
  });

  it("cancels a delivery while a worker has claimed the job and then sends nothing", async () => {
    const { author, recipient, contact } = await readyPair();
    await setClock(author.cookie, "2026-08-02T08:00:00.000Z");
    const id = await createMemory(author.cookie);
    await schedule(author.cookie, id, contact.id, "2026-08-02");
    await setClock(author.cookie, "2026-08-02T09:00:00.000Z");
    const rule = await app.prisma.releaseRule.findFirstOrThrow({ where: { capsuleItemId: id, status: "active" } });
    const item = await app.prisma.capsuleItem.findUniqueOrThrow({ where: { id } });
    await app.prisma.releaseJob.create({
      data: {
        idempotencyKey: `${id}:${contact.id}:claimed:g${item.scheduleGeneration}`,
        releaseRuleId: rule.id,
        capsuleItemId: id,
        personId: contact.id,
        occurrenceAt: exactInstant("2026-08-02", "09:00", "UTC"),
        scheduleGeneration: item.scheduleGeneration,
        status: "processing",
        claimedAt: new Date("2026-08-02T09:00:00.000Z"),
      },
    });
    const cancelled = await app.inject({ method: "POST", url: `/v1/memories/${id}/cancel`, headers: { cookie: author.cookie } });
    expect(cancelled.statusCode).toBe(200);
    const claimed = await app.prisma.releaseJob.findFirstOrThrow({ where: { capsuleItemId: id, status: "cancelled" } });
    expect(claimed.lastError).toBe("superseded");
    const tick = await runWorkerTick(app.prisma, { simulated: true, ownerUserId: author.body.user.id, workerId: "during-cancel" });
    expect(tick.calendarJobsSent).toBe(0);
    expect(await app.prisma.devMessage.count({ where: { templateId: "memory_ready" } })).toBe(0);
    const hidden = await app.inject({ method: "GET", url: `/v1/memories/${id}`, headers: { cookie: recipient.cookie } });
    expect(hidden.statusCode).toBe(404);
  });

  it("does not describe an uncertain or accepted email as recalled", async () => {
    const { author, recipient, contact } = await readyPair();
    await setClock(author.cookie, "2026-08-02T08:00:00.000Z");
    const id = await createMemory(author.cookie);
    await schedule(author.cookie, id, contact.id, "2026-08-02");
    await setClock(author.cookie, "2026-08-02T09:00:00.000Z");
    process.env.DIGI_SMTP_RESULT = "ambiguous";
    await runWorkerTick(app.prisma, { simulated: true, ownerUserId: author.body.user.id, workerId: "timeout" });
    delete process.env.DIGI_SMTP_RESULT;
    expect(capturedMail).toHaveLength(1);
    const cancelled = await app.inject({ method: "POST", url: `/v1/memories/${id}/cancel`, headers: { cookie: author.cookie } });
    expect(cancelled.statusCode).toBe(200);
    expect(cancelled.json().message.toLowerCase()).toContain("cannot be recalled");
    expect(cancelled.json().message.toLowerCase()).not.toContain("was recalled");
    const uncertain = await app.prisma.releaseJob.findFirstOrThrow({ where: { capsuleItemId: id } });
    expect(uncertain.status).toBe("uncertain");
    expect(await app.prisma.capsuleItem.findUnique({ where: { id } })).toMatchObject({ status: "draft" });
    const hidden = await app.inject({ method: "GET", url: `/v1/memories/${id}`, headers: { cookie: recipient.cookie } });
    expect(hidden.statusCode).toBe(404);
    await runWorkerTick(app.prisma, { simulated: true, ownerUserId: author.body.user.id, workerId: "timeout-again" });
    expect(capturedMail).toHaveLength(1);

    await setClock(author.cookie, "2026-08-02T08:00:00.000Z");
    const sentId = await createMemory(author.cookie);
    const acceptedSchedule = await schedule(author.cookie, sentId, contact.id, "2026-08-02");
    expect(acceptedSchedule.statusCode).toBe(200);
    await setClock(author.cookie, "2026-08-02T09:00:00.000Z");
    await runWorkerTick(app.prisma, { simulated: true, ownerUserId: author.body.user.id, workerId: "accepted" });
    const refused = await app.inject({ method: "POST", url: `/v1/memories/${sentId}/cancel`, headers: { cookie: author.cookie } });
    expect(refused.statusCode).toBe(409);
    expect(refused.json().error.message).toContain("cannot be recalled");
    const sent = await app.prisma.releaseJob.findFirstOrThrow({ where: { capsuleItemId: sentId, status: "sent" } });
    expect(sent.providerResponse).toBe("provider_accepted_not_inbox_delivery");
    const kept = await app.inject({ method: "GET", url: `/v1/memories/${sentId}`, headers: { cookie: author.cookie } });
    expect(kept.json().memory.body).toBe("PRIVATE_SCHEDULE_LETTER");
  });

  it("refuses another account from changing or cancelling the schedule", async () => {
    const { author, contact } = await readyPair();
    const stranger = await registerUser(app, "stranger.schedule@example.test", "Stranger");
    await verifyEmail(app, stranger.cookie, stranger.token);
    await setClock(author.cookie, "2026-08-01T00:00:00.000Z");
    const id = await createMemory(author.cookie);
    await schedule(author.cookie, id, contact.id, "2026-08-02");
    const generation = (await app.prisma.capsuleItem.findUniqueOrThrow({ where: { id } })).scheduleGeneration;
    const edit = await schedule(stranger.cookie, id, contact.id, "2026-08-09");
    const cancel = await app.inject({ method: "POST", url: `/v1/memories/${id}/cancel`, headers: { cookie: stranger.cookie } });
    expect(edit.statusCode).toBe(404);
    expect(cancel.statusCode).toBe(404);
    expect((await app.prisma.capsuleItem.findUniqueOrThrow({ where: { id } })).scheduleGeneration).toBe(generation);
    expect(await app.prisma.releaseRule.count({ where: { capsuleItemId: id, status: "active" } })).toBe(1);
  });
});
