import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { addVerifiedContact, createApp, mp4, multipart, png, registerUser, resetDatabase, verifyEmail } from "./helpers";

const app = await createApp();
afterAll(async () => app.close());
beforeEach(async () => {
  process.env.VERIFICATION_RELEASES_ENABLED = "false";
  await resetDatabase(app);
});

async function readyAuthor(email: string) {
  const author = await registerUser(app, email);
  await verifyEmail(app, author.cookie, author.token);
  return author;
}

describe("scheduled delivery", () => {
  it("delivers a letter once to the selected recipient and does not repeat it", async () => {
    const author = await readyAuthor("scheduler@example.test");
    const recipient = await addVerifiedContact(app, author.cookie, {
      displayName: "Avery",
      email: "avery@example.test",
    });
    const blake = await addVerifiedContact(app, author.cookie, {
      displayName: "Blake",
      email: "blake@example.test",
    });
    const stranger = await addVerifiedContact(app, author.cookie, {
      displayName: "Not Selected",
      email: "stranger@example.test",
    });
    const created = await app.inject({
      method: "POST",
      url: "/v1/memories",
      headers: { cookie: author.cookie },
      payload: { title: "Birthday note", body: "SECRET_LETTER_PHRASE" },
    });
    const id = created.json().memory.id as string;
    const photo = multipart(png, "dot.png", "image/png");
    await app.inject({
      method: "POST",
      url: `/v1/memories/${id}/attachments`,
      headers: { ...photo.headers, cookie: author.cookie },
      payload: photo.body,
    });
    const video = multipart(mp4, "clip.mp4", "video/mp4");
    await app.inject({
      method: "POST",
      url: `/v1/memories/${id}/attachments`,
      headers: { ...video.headers, cookie: author.cookie },
      payload: video.body,
    });
    await app.inject({
      method: "POST",
      url: "/v1/dev/clock",
      headers: { cookie: author.cookie },
      payload: { simulatedNow: "2026-06-01T00:00:00.000Z" },
    });
    const scheduled = await app.inject({
      method: "POST",
      url: `/v1/memories/${id}/schedule`,
      headers: { cookie: author.cookie },
      payload: {
        mode: "on_date",
        localDate: "2026-06-02",
        localTime: "09:00",
        timeZone: "UTC",
        recipientIds: [recipient.id, blake.id],
      },
    });
    expect(scheduled.statusCode).toBe(200);
    await app.inject({
      method: "POST",
      url: "/v1/dev/clock",
      headers: { cookie: author.cookie },
      payload: { simulatedNow: "2026-06-02T09:00:00.000Z" },
    });
    const first = await app.inject({ method: "POST", url: "/v1/dev/worker/tick", headers: { cookie: author.cookie } });
    expect(first.json().calendarJobsSent).toBe(2);
    const second = await app.inject({ method: "POST", url: "/v1/dev/worker/tick", headers: { cookie: author.cookie } });
    expect(second.json().calendarJobsSent).toBe(0);
    const jobs = await app.prisma.releaseJob.findMany();
    expect(jobs).toHaveLength(2);
    expect(jobs.every((job) => job.status === "sent")).toBe(true);
    expect(jobs.map((job) => job.personId).sort()).toEqual([recipient.id, blake.id].sort());
    expect(jobs.some((job) => job.personId === stranger.id)).toBe(false);
    const notices = await app.prisma.notificationDelivery.findMany({ where: { templateId: "memory_ready" } });
    expect(notices).toHaveLength(2);
    const inbox = await app.prisma.devMessage.findMany({ where: { templateId: "memory_ready" } });
    expect(inbox).toHaveLength(2);
    expect(JSON.stringify(inbox)).toContain("SECRET_LETTER_PHRASE");
    expect(JSON.stringify(inbox)).toContain("dot.png");
    expect(JSON.stringify(inbox)).toContain("clip.mp4");
    expect(inbox.map((message) => message.destination).sort()).toEqual(["avery@example.test", "blake@example.test"]);
    expect(inbox.some((message) => message.destination === "stranger@example.test")).toBe(false);
    const memory = await app.inject({ method: "GET", url: `/v1/memories/${id}`, headers: { cookie: author.cookie } });
    expect(memory.json().memory.status).toBe("released");
    expect(memory.json().memory.attachments).toHaveLength(2);
  });

  it("does not deliver a future memory and can cancel it", async () => {
    const author = await readyAuthor("future@example.test");
    const recipient = await addVerifiedContact(app, author.cookie, { displayName: "Sam", email: "sam@example.test" });
    const created = await app.inject({
      method: "POST",
      url: "/v1/memories",
      headers: { cookie: author.cookie },
      payload: { title: "Later", body: "Not yet" },
    });
    const id = created.json().memory.id as string;
    await app.inject({
      method: "POST",
      url: "/v1/dev/clock",
      headers: { cookie: author.cookie },
      payload: { simulatedNow: "2026-06-01T00:00:00.000Z" },
    });
    await app.inject({
      method: "POST",
      url: `/v1/memories/${id}/schedule`,
      headers: { cookie: author.cookie },
      payload: { mode: "on_date", localDate: "2026-07-01", localTime: "10:00", timeZone: "UTC", recipientIds: [recipient.id] },
    });
    await app.inject({ method: "POST", url: "/v1/dev/worker/tick", headers: { cookie: author.cookie } });
    expect(await app.prisma.releaseJob.count()).toBe(0);
    const cancelled = await app.inject({ method: "POST", url: `/v1/memories/${id}/cancel`, headers: { cookie: author.cookie } });
    expect(cancelled.json().memory.status).toBe("draft");
  });
});
