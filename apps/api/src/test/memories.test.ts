import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { addVerifiedContact, createApp, mp4, multipart, png, registerUser, resetDatabase, verifyEmail } from "./helpers";

const app = await createApp();
afterAll(async () => app.close());
beforeEach(async () => resetDatabase(app));

describe("memories, media, and recipients", () => {
  it("creates, edits, lists, and blocks another user", async () => {
    const author = await registerUser(app, "owner@example.test");
    const other = await registerUser(app, "other@example.test");
    const created = await app.inject({
      method: "POST",
      url: "/v1/memories",
      headers: { cookie: author.cookie },
      payload: { title: "For later", body: "A private letter" },
    });
    expect(created.statusCode).toBe(201);
    const id = created.json().memory.id as string;
    const edited = await app.inject({
      method: "PATCH",
      url: `/v1/memories/${id}`,
      headers: { cookie: author.cookie },
      payload: { body: "A revised letter" },
    });
    expect(edited.json().memory.body).toBe("A revised letter");
    const foreign = await app.inject({ method: "GET", url: `/v1/memories/${id}`, headers: { cookie: other.cookie } });
    expect(foreign.statusCode).toBe(404);
    const removed = await app.inject({ method: "DELETE", url: `/v1/memories/${id}`, headers: { cookie: author.cookie } });
    expect(removed.statusCode).toBe(204);
    const gone = await app.inject({ method: "GET", url: `/v1/memories/${id}`, headers: { cookie: author.cookie } });
    expect(gone.statusCode).toBe(404);
  });

  it("stores a photo and a video privately and allows removal before release", async () => {
    const author = await registerUser(app, "media@example.test");
    const memory = await app.inject({
      method: "POST",
      url: "/v1/memories",
      headers: { cookie: author.cookie },
      payload: { title: "With files", body: "See the attachments" },
    });
    const id = memory.json().memory.id as string;
    const photo = multipart(png, "dot.png", "image/png");
    const uploaded = await app.inject({
      method: "POST",
      url: `/v1/memories/${id}/attachments`,
      headers: { ...photo.headers, cookie: author.cookie },
      payload: photo.body,
    });
    expect(uploaded.statusCode).toBe(201);
    const assetId = uploaded.json().attachment.id as string;
    const video = multipart(mp4, "clip.mp4", "video/mp4");
    const videoUpload = await app.inject({
      method: "POST",
      url: `/v1/memories/${id}/attachments`,
      headers: { ...video.headers, cookie: author.cookie },
      payload: video.body,
    });
    expect(videoUpload.statusCode).toBe(201);
    const preview = await app.inject({
      method: "GET",
      url: `/v1/media/${assetId}/content`,
      headers: { cookie: author.cookie },
    });
    expect(preview.statusCode).toBe(200);
    expect(preview.headers["cache-control"]).toContain("private");
    expect(preview.rawPayload.equals(png)).toBe(true);
    const anonymous = await app.inject({ method: "GET", url: `/v1/media/${assetId}/content` });
    expect(anonymous.statusCode).toBe(401);
    const other = await registerUser(app, "thief@example.test");
    const stolen = await app.inject({ method: "GET", url: `/v1/media/${assetId}/content`, headers: { cookie: other.cookie } });
    expect(stolen.statusCode).toBe(404);
    const deleted = await app.inject({
      method: "DELETE",
      url: `/v1/memories/${id}/attachments/${assetId}`,
      headers: { cookie: author.cookie },
    });
    expect(deleted.statusCode).toBe(204);
  });

  it("rejects an unsupported file and requires verified recipients", async () => {
    const author = await registerUser(app, "rules@example.test");
    await verifyEmail(app, author.cookie, author.token);
    const memory = await app.inject({
      method: "POST",
      url: "/v1/memories",
      headers: { cookie: author.cookie },
      payload: { title: "Rules", body: "Hello" },
    });
    const id = memory.json().memory.id as string;
    const text = multipart(Buffer.from("hello"), "note.txt", "text/plain");
    const rejected = await app.inject({
      method: "POST",
      url: `/v1/memories/${id}/attachments`,
      headers: { ...text.headers, cookie: author.cookie },
      payload: text.body,
    });
    expect(rejected.statusCode).toBe(400);
    const disguised = multipart(Buffer.from("<html>not a png</html>"), "photo.png", "image/png");
    const spoofed = await app.inject({
      method: "POST",
      url: `/v1/memories/${id}/attachments`,
      headers: { ...disguised.headers, cookie: author.cookie },
      payload: disguised.body,
    });
    expect(spoofed.statusCode).toBe(400);
    expect(spoofed.json().error.code).toBe("UNSUPPORTED_FILE");
    const contact = await app.inject({
      method: "POST",
      url: "/v1/contacts",
      headers: { cookie: author.cookie },
      payload: { displayName: "Jordan", email: "jordan@example.test", phone: "+1 555 010 0199", roles: ["recipient"] },
    });
    const scheduled = await app.inject({
      method: "POST",
      url: `/v1/memories/${id}/schedule`,
      headers: { cookie: author.cookie },
      payload: {
        mode: "on_date",
        localDate: "2026-12-01",
        localTime: "09:00",
        timeZone: "UTC",
        recipientIds: [contact.json().contact.id],
      },
    });
    expect(scheduled.statusCode).toBe(400);
    const verified = await addVerifiedContact(app, author.cookie, {
      displayName: "Riley",
      email: "riley@example.test",
      roles: ["recipient"],
    });
    const saved = await app.inject({
      method: "POST",
      url: `/v1/memories/${id}/schedule`,
      headers: { cookie: author.cookie },
      payload: {
        mode: "on_date",
        localDate: "2026-12-01",
        localTime: "09:00",
        timeZone: "UTC",
        recipientIds: [verified.id],
      },
    });
    expect(saved.statusCode).toBe(200);
    expect(saved.json().memory.recipients).toHaveLength(1);
    expect(saved.json().memory.deliveryMode).toBe("on_date");
  });

  it("rejects a wall-clock tomorrow that is behind the test clock", async () => {
    const author = await registerUser(app, "tomorrow@example.test");
    await verifyEmail(app, author.cookie, author.token);
    const recipient = await addVerifiedContact(app, author.cookie, {
      displayName: "Sam",
      email: "sam-tomorrow@example.test",
    });
    const created = await app.inject({
      method: "POST",
      url: "/v1/memories",
      headers: { cookie: author.cookie },
      payload: { title: "Tomorrow", body: "See you then" },
    });
    const id = created.json().memory.id as string;
    const clock = await app.inject({
      method: "POST",
      url: "/v1/dev/clock",
      headers: { cookie: author.cookie },
      payload: { simulatedNow: "2027-02-16T10:00:00.000Z" },
    });
    expect(clock.statusCode).toBe(200);
    const scheduled = await app.inject({
      method: "POST",
      url: `/v1/memories/${id}/schedule`,
      headers: { cookie: author.cookie },
      payload: {
        mode: "on_date",
        localDate: "2026-11-07",
        localTime: "09:00",
        timeZone: "Asia/Karachi",
        recipientIds: [recipient.id],
      },
    });
    expect(scheduled.statusCode).toBe(400);
    expect(scheduled.json().error.code).toBe("VALIDATION_ERROR");
    expect(scheduled.json().error.message).toContain("16 February 2027");
    expect(scheduled.json().error.message).toContain("Asia/Karachi");
    expect(scheduled.json().error.message).toContain("ahead of the real time");
    expect(scheduled.json().error.message).toContain("test clock");
  });

  it("rejects 29 February in a non-leap year", async () => {
    const author = await registerUser(app, "leap@example.test");
    await verifyEmail(app, author.cookie, author.token);
    const recipient = await addVerifiedContact(app, author.cookie, {
      displayName: "Sam",
      email: "sam-leap@example.test",
    });
    const created = await app.inject({
      method: "POST",
      url: "/v1/memories",
      headers: { cookie: author.cookie },
      payload: { title: "Leap", body: "Not a real day" },
    });
    const id = created.json().memory.id as string;
    await app.inject({
      method: "POST",
      url: "/v1/dev/clock",
      headers: { cookie: author.cookie },
      payload: { simulatedNow: "2027-01-01T00:00:00.000Z" },
    });
    const scheduled = await app.inject({
      method: "POST",
      url: `/v1/memories/${id}/schedule`,
      headers: { cookie: author.cookie },
      payload: {
        mode: "on_date",
        localDate: "2027-02-29",
        localTime: "09:00",
        timeZone: "UTC",
        recipientIds: [recipient.id],
      },
    });
    expect(scheduled.statusCode).toBe(400);
    expect(scheduled.json().error.message).toContain("valid date");
  });

  it("returns a readable message for an unknown route", async () => {
    const missing = await app.inject({ method: "GET", url: "/v1/does-not-exist" });
    expect(missing.statusCode).toBe(404);
    expect(missing.json().error.code).toBe("NOT_FOUND");
    expect(missing.json().error.message).toContain("/v1/does-not-exist");
  });
});
