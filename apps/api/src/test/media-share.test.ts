import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { runWorkerTick } from "../services/worker-tick";
import { addVerifiedContact, createApp, mp4, multipart, png, registerUser, resetDatabase, verifyEmail } from "./helpers";

const app = await createApp();
afterAll(async () => app.close());

beforeEach(async () => {
  process.env.NODE_ENV = "test";
  process.env.DIGI_TEST_MODE = "true";
  await resetDatabase(app);
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

async function accounts() {
  const owner = await registerUser(app, "owner.share@example.test", "Owner A");
  await verifyEmail(app, owner.cookie, owner.token);
  const receiver = await registerUser(app, "receiver.share@example.test", "Receiver B");
  await verifyEmail(app, receiver.cookie, receiver.token);
  const stranger = await registerUser(app, "stranger.share@example.test", "User C");
  await verifyEmail(app, stranger.cookie, stranger.token);
  const contact = await addVerifiedContact(app, owner.cookie, { displayName: "Receiver B", email: "receiver.share@example.test" });
  return { owner, receiver, stranger, contact };
}

async function memoryWithFiles(cookie: string) {
  const created = await app.inject({
    method: "POST",
    url: "/v1/memories",
    headers: { cookie },
    payload: { title: "Private photo", body: "HIDDEN_SHARE_LETTER" },
  });
  const id = created.json().memory.id as string;
  const photo = multipart(png, "dot.png", "image/png");
  const video = multipart(mp4, "clip.mp4", "video/mp4");
  const uploaded = await app.inject({
    method: "POST",
    url: `/v1/memories/${id}/attachments`,
    headers: { ...photo.headers, cookie },
    payload: photo.body,
  });
  const filmed = await app.inject({
    method: "POST",
    url: `/v1/memories/${id}/attachments`,
    headers: { ...video.headers, cookie },
    payload: video.body,
  });
  return {
    id,
    photoId: uploaded.json().attachment.id as string,
    videoId: filmed.json().attachment.id as string,
  };
}

function tokenFrom(url: string) {
  return url.split("#")[1] || "";
}

async function schedule(cookie: string, id: string, recipientId: string, localDate: string) {
  const response = await app.inject({
    method: "POST",
    url: `/v1/memories/${id}/schedule`,
    headers: { cookie },
    payload: { mode: "on_date", localDate, localTime: "09:00", timeZone: "UTC", recipientIds: [recipientId] },
  });
  expect(response.statusCode).toBe(200);
}

async function deliver(cookie: string, ownerId: string, when: string) {
  await setClock(cookie, when);
  const tick = await runWorkerTick(app.prisma, { simulated: true, ownerUserId: ownerId });
  expect(tick.calendarJobsSent).toBeGreaterThan(0);
}

describe("temporary media links", () => {
  it("lets only the signed-in recipient open a delivered file, including a ranged video", async () => {
    const { owner, receiver, stranger, contact } = await accounts();
    await setClock(owner.cookie, "2026-08-01T00:00:00.000Z");
    const memory = await memoryWithFiles(owner.cookie);
    await schedule(owner.cookie, memory.id, contact.id, "2026-08-02");
    const created = await app.inject({
      method: "POST",
      url: `/v1/memories/${memory.id}/media/${memory.photoId}/shares`,
      headers: { cookie: owner.cookie },
      payload: { recipientId: contact.id, expiresInHours: 168 },
    });
    expect(created.statusCode).toBe(201);
    const token = tokenFrom(created.json().share.url);
    expect(token.length).toBeGreaterThan(20);
    expect(JSON.stringify(created.json())).not.toContain("storageKey");
    const early = await app.inject({
      method: "POST",
      url: "/v1/media/shares/open",
      headers: { cookie: receiver.cookie },
      payload: { token },
    });
    expect(early.statusCode).toBe(403);
    expect(early.json().error.message).not.toContain("HIDDEN_SHARE_LETTER");
    await deliver(owner.cookie, owner.body.user.id, "2026-08-02T09:00:00.000Z");
    const opened = await app.inject({
      method: "POST",
      url: "/v1/media/shares/open",
      headers: { cookie: receiver.cookie },
      payload: { token },
    });
    expect(opened.statusCode).toBe(200);
    expect(opened.json().file.id).toBe(memory.photoId);
    const file = await app.inject({ method: "GET", url: `/v1/media/${memory.photoId}/content`, headers: { cookie: receiver.cookie } });
    expect(file.statusCode).toBe(200);
    expect(file.headers["cache-control"]).toBe("private, no-store");
    expect(file.headers["referrer-policy"]).toBe("no-referrer");
    const video = await app.inject({
      method: "GET",
      url: `/v1/media/${memory.videoId}/content`,
      headers: { cookie: receiver.cookie, range: "bytes=0-7" },
    });
    expect(video.statusCode).toBe(206);
    expect(video.headers["content-type"]).toBe("video/mp4");
    expect(video.headers["accept-ranges"]).toBe("bytes");
    expect(video.rawPayload.length).toBe(8);

    const other = await app.inject({
      method: "POST",
      url: "/v1/media/shares/open",
      headers: { cookie: stranger.cookie },
      payload: { token },
    });
    expect(other.statusCode).toBe(403);
    expect(other.json().error.code).toBe("LINK_RECIPIENT_MISMATCH");
    const loggedOut = await app.inject({ method: "POST", url: "/v1/media/shares/open", payload: { token } });
    expect(loggedOut.statusCode).toBe(401);
    const stolen = await app.inject({ method: "GET", url: `/v1/media/${memory.photoId}/content`, headers: { cookie: stranger.cookie } });
    expect(stolen.statusCode).toBe(404);
    const guessed = await app.inject({
      method: "POST",
      url: "/v1/media/shares/open",
      headers: { cookie: receiver.cookie },
      payload: { token: token.slice(0, -2) + "zz" },
    });
    expect(guessed.statusCode).toBe(404);
    const swapped = await app.inject({
      method: "GET",
      url: `/v1/media/${memory.videoId}/content`,
      headers: { cookie: stranger.cookie },
    });
    expect(swapped.statusCode).toBe(404);
    const asset = await app.prisma.mediaAsset.findUniqueOrThrow({ where: { id: memory.photoId } });
    const direct = await app.inject({ method: "GET", url: `/v1/${asset.storageKey}` });
    expect(direct.statusCode).toBe(404);
    const logged = await app.prisma.auditEvent.findFirst({ where: { action: "media.share_opened" } });
    expect(JSON.stringify(logged)).not.toContain(token);
  });

  it("rejects expired, revoked, deleted, rescheduled, and removed-recipient links on every attempt", async () => {
    const { owner, receiver, contact } = await accounts();
    await setClock(owner.cookie, "2026-08-01T00:00:00.000Z");
    const memory = await memoryWithFiles(owner.cookie);
    await schedule(owner.cookie, memory.id, contact.id, "2026-08-02");
    const created = await app.inject({
      method: "POST",
      url: `/v1/memories/${memory.id}/media/${memory.photoId}/shares`,
      headers: { cookie: owner.cookie },
      payload: { recipientId: contact.id, expiresInHours: 1 },
    });
    const token = tokenFrom(created.json().share.url);
    const moved = await app.inject({
      method: "POST",
      url: `/v1/memories/${memory.id}/schedule`,
      headers: { cookie: owner.cookie },
      payload: { mode: "on_date", localDate: "2026-08-03", localTime: "09:00", timeZone: "UTC", recipientIds: [contact.id] },
    });
    expect(moved.statusCode).toBe(200);
    await deliver(owner.cookie, owner.body.user.id, "2026-08-03T09:00:00.000Z");
    const old = await app.inject({
      method: "POST",
      url: "/v1/media/shares/open",
      headers: { cookie: receiver.cookie },
      payload: { token },
    });
    expect(old.statusCode).toBe(403);
    expect(old.json().error.code).toBe("LINK_REVOKED");

    const replacement = await app.inject({
      method: "POST",
      url: `/v1/memories/${memory.id}/media/${memory.photoId}/shares`,
      headers: { cookie: owner.cookie },
      payload: { recipientId: contact.id, expiresInHours: 1 },
    });
    const nextToken = tokenFrom(replacement.json().share.url);
    const revoked = await app.inject({
      method: "POST",
      url: `/v1/media/shares/${replacement.json().share.id}/revoke`,
      headers: { cookie: owner.cookie },
    });
    expect(revoked.statusCode).toBe(200);
    const afterRevoke = await app.inject({
      method: "POST",
      url: "/v1/media/shares/open",
      headers: { cookie: receiver.cookie },
      payload: { token: nextToken },
    });
    expect(afterRevoke.json().error.code).toBe("LINK_REVOKED");

    const expiring = await app.inject({
      method: "POST",
      url: `/v1/memories/${memory.id}/media/${memory.photoId}/shares`,
      headers: { cookie: owner.cookie },
      payload: { recipientId: contact.id, expiresInHours: 1 },
    });
    const expiringToken = tokenFrom(expiring.json().share.url);
    await setClock(owner.cookie, "2026-08-03T11:00:00.000Z");
    const expired = await app.inject({
      method: "POST",
      url: "/v1/media/shares/open",
      headers: { cookie: receiver.cookie },
      payload: { token: expiringToken },
    });
    expect(expired.json().error.code).toBe("LINK_EXPIRED");
    const again = await app.inject({
      method: "POST",
      url: "/v1/media/shares/open",
      headers: { cookie: receiver.cookie },
      payload: { token: expiringToken },
    });
    expect(again.json().error.code).toBe("LINK_EXPIRED");

    const fresh = await app.inject({
      method: "POST",
      url: `/v1/memories/${memory.id}/media/${memory.videoId}/shares/refresh`,
      headers: { cookie: receiver.cookie },
    });
    expect(fresh.statusCode).toBe(201);
    await app.prisma.mediaAsset.update({ where: { id: memory.videoId }, data: { status: "deleted", deletedAt: new Date("2026-08-03T11:00:00.000Z") } });
    const deletedFile = await app.inject({
      method: "POST",
      url: "/v1/media/shares/open",
      headers: { cookie: receiver.cookie },
      payload: { token: tokenFrom(fresh.json().share.url) },
    });
    expect(deletedFile.statusCode).toBe(403);

    const extra = await registerUser(app, "extra.share@example.test", "Extra");
    await verifyEmail(app, extra.cookie, extra.token);
    const extraContact = await addVerifiedContact(app, owner.cookie, {
      displayName: "Extra",
      email: "extra.share@example.test",
      phone: "+1 555 010 0188",
    });
    const pending = await memoryWithFiles(owner.cookie);
    await schedule(owner.cookie, pending.id, extraContact.id, "2026-08-20");
    const pendingLink = await app.inject({
      method: "POST",
      url: `/v1/memories/${pending.id}/media/${pending.photoId}/shares`,
      headers: { cookie: owner.cookie },
      payload: { recipientId: extraContact.id, expiresInHours: 24 },
    });
    expect(pendingLink.statusCode).toBe(201);
    const removed = await app.inject({ method: "DELETE", url: `/v1/contacts/${extraContact.id}`, headers: { cookie: owner.cookie } });
    expect(removed.statusCode).toBe(204);
    const lost = await app.inject({
      method: "POST",
      url: "/v1/media/shares/open",
      headers: { cookie: extra.cookie },
      payload: { token: tokenFrom(pendingLink.json().share.url) },
    });
    expect(lost.statusCode).toBeGreaterThanOrEqual(403);
    expect(JSON.stringify(lost.json())).not.toContain("HIDDEN_SHARE_LETTER");
  });

  it("invalidates links when the memory is deleted and purges old link records", async () => {
    const { owner, receiver, contact } = await accounts();
    await setClock(owner.cookie, "2026-09-01T00:00:00.000Z");
    const memory = await memoryWithFiles(owner.cookie);
    await schedule(owner.cookie, memory.id, contact.id, "2026-09-02");
    const created = await app.inject({
      method: "POST",
      url: `/v1/memories/${memory.id}/media/${memory.photoId}/shares`,
      headers: { cookie: owner.cookie },
      payload: { recipientId: contact.id, expiresInHours: 24 },
    });
    const deleted = await app.inject({ method: "DELETE", url: `/v1/memories/${memory.id}`, headers: { cookie: owner.cookie } });
    expect(deleted.statusCode).toBe(204);
    const stored = await app.prisma.capsuleItem.findUnique({ where: { id: memory.id } });
    expect(stored?.status).toBe("cancelled");
    const opened = await app.inject({
      method: "POST",
      url: "/v1/media/shares/open",
      headers: { cookie: receiver.cookie },
      payload: { token: tokenFrom(created.json().share.url) },
    });
    expect(opened.statusCode).toBe(403);
    await app.prisma.mediaShareLink.updateMany({ data: { expiresAt: new Date("2026-07-01T00:00:00.000Z"), status: "expired" } });
    const kept = await app.prisma.mediaShareLink.create({
      data: {
        tokenHash: "active-hash-not-a-token",
        ownerUserId: owner.body.user.id,
        recipientUserId: receiver.body.user.id,
        personId: contact.id,
        capsuleItemId: memory.id,
        mediaAssetId: memory.photoId,
        expiresAt: new Date("2026-10-01T00:00:00.000Z"),
        status: "active",
      },
    });
    await runWorkerTick(app.prisma, { simulated: true, ownerUserId: owner.body.user.id });
    expect(await app.prisma.mediaShareLink.findUnique({ where: { id: created.json().share.id } })).toBeNull();
    expect(await app.prisma.mediaShareLink.findUnique({ where: { id: kept.id } })).toBeTruthy();
    expect(await app.prisma.mediaAsset.count({ where: { id: memory.photoId } })).toBe(1);
  });
});
