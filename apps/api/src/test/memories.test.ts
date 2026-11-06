import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { addVerifiedContact, createApp, multipart, png, registerUser, resetDatabase, verifyEmail } from "./helpers";

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
    const video = multipart(Buffer.from("not-a-real-video-but-typed"), "clip.mp4", "video/mp4");
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
});
