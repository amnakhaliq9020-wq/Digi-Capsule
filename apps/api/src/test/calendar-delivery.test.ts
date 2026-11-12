import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { exactInstant } from "@digi/domain";
import { addVerifiedContact, createApp, multipart, png, registerUser, resetDatabase, verifyEmail } from "./helpers";
import { runWorkerTick } from "../services/worker-tick";

const app = await createApp();
afterAll(async () => app.close());
beforeEach(async () => {
  process.env.NODE_ENV = "test";
  process.env.DIGI_TEST_MODE = "true";
  process.env.VERIFICATION_RELEASES_ENABLED = "false";
  await resetDatabase(app);
});

async function setZone(cookie: string, timeZone: string) {
  const response = await app.inject({
    method: "PATCH",
    url: "/v1/auth/me",
    headers: { cookie },
    payload: { timeZone },
  });
  expect(response.statusCode).toBe(200);
}

async function setClock(cookie: string, simulatedNow: string) {
  const response = await app.inject({
    method: "POST",
    url: "/v1/dev/clock",
    headers: { cookie },
    payload: { simulatedNow },
  });
  expect(response.statusCode).toBe(200);
}

async function readyPair(authorZone: string, recipientZone: string) {
  const recipient = await registerUser(app, "sam.calendar@example.test", "Sam");
  await verifyEmail(app, recipient.cookie, recipient.token);
  await setZone(recipient.cookie, recipientZone);
  const author = await registerUser(app, "author.calendar@example.test", "Author");
  await verifyEmail(app, author.cookie, author.token);
  await setZone(author.cookie, authorZone);
  const contact = await addVerifiedContact(app, author.cookie, { displayName: "Sam", email: "sam.calendar@example.test" });
  return { author, recipient, contact };
}

async function createMemory(cookie: string, title = "Letter") {
  const created = await app.inject({
    method: "POST",
    url: "/v1/memories",
    headers: { cookie },
    payload: { title, body: "PRIVATE_CALENDAR_LETTER" },
  });
  expect(created.statusCode).toBe(201);
  return created.json().memory.id as string;
}

async function schedule(cookie: string, id: string, recipientId: string, localDate: string, localTime = "09:00", timeZone = "UTC") {
  return app.inject({
    method: "POST",
    url: `/v1/memories/${id}/schedule`,
    headers: { cookie },
    payload: { mode: "on_date", localDate, localTime, timeZone, recipientIds: [recipientId] },
  });
}

describe("calendar delivery in the recipient time zone", () => {
  it("delivers at 9:00 on that calendar day when both people use Asia/Karachi", async () => {
    const { author, recipient, contact } = await readyPair("Asia/Karachi", "Asia/Karachi");
    await setClock(author.cookie, "2026-07-14T00:00:00.000Z");
    const id = await createMemory(author.cookie);
    const saved = await schedule(author.cookie, id, contact.id, "2026-07-15", "09:00", "UTC");
    expect(saved.statusCode).toBe(200);
    expect(saved.json().memory.schedule.localDate).toBe("2026-07-15");
    expect(saved.json().memory.schedule.localTime).toBe("09:00");
    expect(saved.json().memory.recipientDeliveries[0].timeZone).toBe("Asia/Karachi");
    expect(saved.json().memory.schedule.nextRunAt).toBe("2026-07-15T04:00:00.000Z");

    await setClock(author.cookie, "2026-07-15T03:59:00.000Z");
    const early = await app.inject({ method: "POST", url: "/v1/dev/worker/tick", headers: { cookie: author.cookie } });
    expect(early.json().calendarJobsSent).toBe(0);
    const hidden = await app.inject({ method: "GET", url: `/v1/memories/${id}`, headers: { cookie: recipient.cookie } });
    expect(hidden.statusCode).toBe(404);

    await setClock(author.cookie, "2026-07-15T04:00:00.000Z");
    const due = await app.inject({ method: "POST", url: "/v1/dev/worker/tick", headers: { cookie: author.cookie } });
    expect(due.json().calendarJobsSent).toBe(1);
    const open = await app.inject({ method: "GET", url: `/v1/memories/${id}`, headers: { cookie: recipient.cookie } });
    expect(open.statusCode).toBe(200);
    expect(open.json().memory.body).toBe("PRIVATE_CALENDAR_LETTER");
  });

  it("uses the recipient calendar day when the sender is in another time zone", async () => {
    const { author, contact } = await readyPair("Asia/Karachi", "America/New_York");
    await setClock(author.cookie, "2026-07-14T00:00:00.000Z");
    const id = await createMemory(author.cookie);
    const saved = await schedule(author.cookie, id, contact.id, "2026-07-15", "09:00", "Asia/Karachi");
    expect(saved.statusCode).toBe(200);
    expect(saved.json().memory.recipientDeliveries[0].timeZone).toBe("America/New_York");
    expect(saved.json().memory.schedule.nextRunAt).toBe(exactInstant("2026-07-15", "09:00", "America/New_York").toISOString());
    expect(saved.json().memory.schedule.nextRunAt).not.toBe(exactInstant("2026-07-15", "09:00", "Asia/Karachi").toISOString());

    await setClock(author.cookie, "2026-07-15T04:00:00.000Z");
    const karachiMorning = await app.inject({ method: "POST", url: "/v1/dev/worker/tick", headers: { cookie: author.cookie } });
    expect(karachiMorning.json().calendarJobsSent).toBe(0);

    await setClock(author.cookie, "2026-07-15T13:00:00.000Z");
    const newYorkMorning = await app.inject({ method: "POST", url: "/v1/dev/worker/tick", headers: { cookie: author.cookie } });
    expect(newYorkMorning.json().calendarJobsSent).toBe(1);
  });

  it("keeps a Pakistan date that starts on the previous UTC day", async () => {
    const { author, contact } = await readyPair("UTC", "Asia/Karachi");
    await setClock(author.cookie, "2026-06-01T00:00:00.000Z");
    const id = await createMemory(author.cookie);
    const saved = await schedule(author.cookie, id, contact.id, "2026-06-02", "02:00", "UTC");
    expect(saved.json().memory.schedule.localDate).toBe("2026-06-02");
    expect(saved.json().memory.schedule.nextRunAt).toBe("2026-06-01T21:00:00.000Z");

    await setClock(author.cookie, "2026-06-01T20:59:00.000Z");
    expect((await app.inject({ method: "POST", url: "/v1/dev/worker/tick", headers: { cookie: author.cookie } })).json().calendarJobsSent).toBe(0);
    await setClock(author.cookie, "2026-06-01T21:00:00.000Z");
    expect((await app.inject({ method: "POST", url: "/v1/dev/worker/tick", headers: { cookie: author.cookie } })).json().calendarJobsSent).toBe(1);
    const shown = await app.inject({ method: "GET", url: `/v1/memories/${id}`, headers: { cookie: author.cookie } });
    expect(shown.json().memory.recipientDeliveries[0].localDate).toBe("2026-06-02");
    expect(shown.json().memory.recipientDeliveries[0].timeZone).toBe("Asia/Karachi");
  });

  it("handles month-end, year-end, leap day, and a non-leap 29 February", async () => {
    const { author, contact } = await readyPair("Asia/Karachi", "America/New_York");
    await setClock(author.cookie, "2026-01-01T00:00:00.000Z");
    const month = await createMemory(author.cookie, "Month");
    const monthSaved = await schedule(author.cookie, month, contact.id, "2026-01-31", "09:00", "Asia/Karachi");
    expect(monthSaved.json().memory.schedule.nextRunAt).toBe("2026-01-31T14:00:00.000Z");
    await setClock(author.cookie, "2026-01-31T13:59:00.000Z");
    expect((await app.inject({ method: "POST", url: "/v1/dev/worker/tick", headers: { cookie: author.cookie } })).json().calendarJobsSent).toBe(0);
    await setClock(author.cookie, "2026-01-31T14:00:00.000Z");
    expect((await app.inject({ method: "POST", url: "/v1/dev/worker/tick", headers: { cookie: author.cookie } })).json().calendarJobsSent).toBe(1);

    await app.prisma.profile.updateMany({ where: { user: { email: "sam.calendar@example.test" } }, data: { timeZone: "Asia/Karachi" } });

    const year = await createMemory(author.cookie, "Year");
    const yearSaved = await schedule(author.cookie, year, contact.id, "2026-12-31", "09:00", "UTC");
    expect(yearSaved.json().memory.schedule.nextRunAt).toBe("2026-12-31T04:00:00.000Z");
    await setClock(author.cookie, "2026-12-31T03:59:00.000Z");
    expect((await app.inject({ method: "POST", url: "/v1/dev/worker/tick", headers: { cookie: author.cookie } })).json().calendarJobsSent).toBe(0);
    await setClock(author.cookie, "2026-12-31T04:00:00.000Z");
    expect((await app.inject({ method: "POST", url: "/v1/dev/worker/tick", headers: { cookie: author.cookie } })).json().calendarJobsSent).toBe(1);

    const leap = await createMemory(author.cookie, "Leap");
    const leapSaved = await schedule(author.cookie, leap, contact.id, "2028-02-29", "09:00", "UTC");
    expect(leapSaved.json().memory.schedule.nextRunAt).toBe("2028-02-29T04:00:00.000Z");
    const invalid = await schedule(author.cookie, await createMemory(author.cookie, "Bad"), contact.id, "2027-02-29", "09:00", "UTC");
    expect(invalid.statusCode).toBe(400);
    expect(invalid.json().error.message).toContain("valid date");
  });

  it("moves a daylight-saving gap forward and keeps the first fall-back offset", async () => {
    const { author, contact } = await readyPair("UTC", "America/New_York");
    await setClock(author.cookie, "2026-01-01T00:00:00.000Z");
    const spring = await createMemory(author.cookie, "Spring");
    const springSaved = await schedule(author.cookie, spring, contact.id, "2026-03-08", "02:30", "UTC");
    expect(springSaved.json().memory.schedule.nextRunAt).toBe("2026-03-08T07:30:00.000Z");
    const fall = await createMemory(author.cookie, "Fall");
    const fallSaved = await schedule(author.cookie, fall, contact.id, "2026-11-01", "01:30", "UTC");
    expect(fallSaved.json().memory.schedule.nextRunAt).toBe("2026-11-01T05:30:00.000Z");

    await setClock(author.cookie, "2026-03-08T07:29:00.000Z");
    expect((await app.inject({ method: "POST", url: "/v1/dev/worker/tick", headers: { cookie: author.cookie } })).json().calendarJobsSent).toBe(0);
    await setClock(author.cookie, "2026-03-08T07:30:00.000Z");
    expect((await app.inject({ method: "POST", url: "/v1/dev/worker/tick", headers: { cookie: author.cookie } })).json().calendarJobsSent).toBe(1);
    expect(await app.prisma.releaseJob.count({ where: { capsuleItemId: fall, status: "sent" } })).toBe(0);
  });

  it("replaces the scheduled instant when the date changes and stops a cancelled or deleted memory", async () => {
    const { author, contact } = await readyPair("Asia/Karachi", "Asia/Karachi");
    await setClock(author.cookie, "2026-07-01T00:00:00.000Z");
    const id = await createMemory(author.cookie);
    expect((await schedule(author.cookie, id, contact.id, "2026-07-15", "09:00", "UTC")).statusCode).toBe(200);
    const moved = await schedule(author.cookie, id, contact.id, "2026-07-16", "09:00", "UTC");
    expect(moved.json().memory.schedule.localDate).toBe("2026-07-16");
    expect(moved.json().memory.schedule.nextRunAt).toBe("2026-07-16T04:00:00.000Z");
    const active = await app.prisma.releaseRule.findMany({ where: { capsuleItemId: id, status: "active" } });
    expect(active).toHaveLength(1);

    await setClock(author.cookie, "2026-07-15T04:00:00.000Z");
    expect((await app.inject({ method: "POST", url: "/v1/dev/worker/tick", headers: { cookie: author.cookie } })).json().calendarJobsSent).toBe(0);
    await setClock(author.cookie, "2026-07-16T04:00:00.000Z");
    expect((await app.inject({ method: "POST", url: "/v1/dev/worker/tick", headers: { cookie: author.cookie } })).json().calendarJobsSent).toBe(1);

    const cancelledId = await createMemory(author.cookie, "Cancel");
    await schedule(author.cookie, cancelledId, contact.id, "2026-08-01", "09:00", "UTC");
    const cancelled = await app.inject({ method: "POST", url: `/v1/memories/${cancelledId}/cancel`, headers: { cookie: author.cookie } });
    expect(cancelled.json().memory.status).toBe("draft");
    await setClock(author.cookie, "2026-08-01T04:00:00.000Z");
    expect((await app.inject({ method: "POST", url: "/v1/dev/worker/tick", headers: { cookie: author.cookie } })).json().calendarJobsSent).toBe(0);

    const deletedId = await createMemory(author.cookie, "Delete");
    await schedule(author.cookie, deletedId, contact.id, "2026-08-02", "09:00", "UTC");
    const removed = await app.inject({ method: "DELETE", url: `/v1/memories/${deletedId}`, headers: { cookie: author.cookie } });
    expect(removed.statusCode).toBe(204);
    await setClock(author.cookie, "2026-08-02T04:00:00.000Z");
    expect((await app.inject({ method: "POST", url: "/v1/dev/worker/tick", headers: { cookie: author.cookie } })).json().calendarJobsSent).toBe(0);
    expect(await app.prisma.releaseJob.count({ where: { capsuleItemId: { in: [cancelledId, deletedId] }, status: "sent" } })).toBe(0);
  });

  it("sends a missed job on the next worker start and does not send it twice", async () => {
    const { author, recipient, contact } = await readyPair("UTC", "UTC");
    await setClock(author.cookie, "2026-05-01T00:00:00.000Z");
    const id = await createMemory(author.cookie);
    const photo = multipart(png, "dot.png", "image/png");
    const uploaded = await app.inject({
      method: "POST",
      url: `/v1/memories/${id}/attachments`,
      headers: { ...photo.headers, cookie: author.cookie },
      payload: photo.body,
    });
    const assetId = uploaded.json().attachment.id as string;
    await schedule(author.cookie, id, contact.id, "2026-05-02", "09:00", "UTC");
    const before = await app.inject({ method: "GET", url: `/v1/media/${assetId}/content`, headers: { cookie: recipient.cookie } });
    expect(before.statusCode).toBe(404);

    await setClock(author.cookie, "2026-05-03T12:00:00.000Z");
    const recovered = await runWorkerTick(app.prisma, { simulated: true });
    expect(recovered.calendarJobsSent).toBe(1);
    const again = await Promise.all([
      runWorkerTick(app.prisma, { simulated: true }),
      runWorkerTick(app.prisma, { simulated: true }),
    ]);
    expect(again.reduce((sum, result) => sum + result.calendarJobsSent, 0)).toBe(0);
    expect(await app.prisma.releaseJob.count({ where: { capsuleItemId: id, status: "sent" } })).toBe(1);
    expect(await app.prisma.notificationDelivery.count({ where: { templateId: "memory_ready" } })).toBe(1);

    const raceId = await createMemory(author.cookie, "Race");
    await schedule(author.cookie, raceId, contact.id, "2026-05-04", "09:00", "UTC");
    await setClock(author.cookie, "2026-05-04T09:00:00.000Z");
    const raced = await Promise.all([
      runWorkerTick(app.prisma, { simulated: true }),
      runWorkerTick(app.prisma, { simulated: true }),
    ]);
    expect(raced.reduce((sum, result) => sum + result.calendarJobsSent, 0)).toBe(1);
    expect(await app.prisma.releaseJob.count({ where: { capsuleItemId: raceId, status: "sent" } })).toBe(1);

    const after = await app.inject({ method: "GET", url: `/v1/media/${assetId}/content`, headers: { cookie: recipient.cookie } });
    expect(after.statusCode).toBe(200);
    const stranger = await registerUser(app, "stranger.calendar@example.test", "Stranger");
    const denied = await app.inject({ method: "GET", url: `/v1/media/${assetId}/content`, headers: { cookie: stranger.cookie } });
    expect(denied.statusCode).toBe(404);
    const deniedMemory = await app.inject({ method: "GET", url: `/v1/memories/${id}`, headers: { cookie: stranger.cookie } });
    expect(deniedMemory.statusCode).toBe(404);
  });
});
