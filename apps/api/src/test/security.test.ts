import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { env } from "../env";
import { createApp, multipart, png, registerUser, resetDatabase, sessionCookie } from "./helpers";

const app = await createApp();

afterAll(async () => {
  await app.close();
});
beforeEach(async () => {
  await resetDatabase(app);
});

async function memory(cookie: string, title: string, body = "A private letter.") {
  const response = await app.inject({
    method: "POST",
    url: "/v1/memories",
    headers: { cookie },
    payload: { title, body },
  });
  expect(response.statusCode).toBe(201);
  return response.json().memory as { id: string; title: string; body: string; attachments: { id: string }[] };
}

async function attach(cookie: string, memoryId: string, file: Buffer, filename: string, mime: string) {
  const upload = multipart(file, filename, mime);
  return app.inject({
    method: "POST",
    url: `/v1/memories/${memoryId}/attachments`,
    headers: { cookie, ...upload.headers },
    payload: upload.body,
  });
}

describe("account and data isolation", () => {
  it("keeps User A and User B on their own memories, files, contacts, and capsules", async () => {
    const authorA = await registerUser(app, "user.a@example.test", "User A");
    const authorB = await registerUser(app, "user.b@example.test", "User B");
    const memoryA = await memory(authorA.cookie, "A private memory", "Letter for A only.");
    const memoryB = await memory(authorB.cookie, "B private memory", "Letter for B only.");
    const uploaded = await attach(authorA.cookie, memoryA.id, png, "a.png", "image/png");
    expect(uploaded.statusCode).toBe(201);
    const assetId = uploaded.json().attachment.id as string;

    const ownA = await app.inject({ method: "GET", url: `/v1/memories/${memoryA.id}`, headers: { cookie: authorA.cookie } });
    const ownB = await app.inject({ method: "GET", url: `/v1/memories/${memoryB.id}`, headers: { cookie: authorB.cookie } });
    expect(ownA.statusCode).toBe(200);
    expect(ownA.json().memory.body).toBe("Letter for A only.");
    expect(ownB.statusCode).toBe(200);
    expect(ownB.json().memory.body).toBe("Letter for B only.");

    const read = await app.inject({ method: "GET", url: `/v1/memories/${memoryB.id}`, headers: { cookie: authorA.cookie } });
    const edit = await app.inject({
      method: "PATCH",
      url: `/v1/memories/${memoryB.id}`,
      headers: { cookie: authorA.cookie },
      payload: { title: "taken" },
    });
    const remove = await app.inject({ method: "DELETE", url: `/v1/memories/${memoryB.id}`, headers: { cookie: authorA.cookie } });
    expect(read.statusCode).toBe(404);
    expect(edit.statusCode).toBe(404);
    expect(remove.statusCode).toBe(404);
    const stillThere = await app.inject({ method: "GET", url: `/v1/memories/${memoryB.id}`, headers: { cookie: authorB.cookie } });
    expect(stillThere.json().memory.title).toBe("B private memory");

    const download = await app.inject({ method: "GET", url: `/v1/media/${assetId}/content`, headers: { cookie: authorB.cookie } });
    const signed = await app.inject({ method: "POST", url: `/v1/media/${assetId}/signed-url`, headers: { cookie: authorB.cookie } });
    const anonymous = await app.inject({ method: "GET", url: `/v1/media/${assetId}/content` });
    expect(download.statusCode).toBe(404);
    expect(signed.statusCode).toBe(404);
    expect(anonymous.statusCode).toBe(401);

    const listA = await app.inject({ method: "GET", url: "/v1/memories?q=B+private", headers: { cookie: authorA.cookie } });
    expect(listA.json().memories.map((item: { title: string }) => item.title)).toEqual(["A private memory"]);
    const forged = await app.inject({
      method: "POST",
      url: "/v1/memories",
      headers: { cookie: authorB.cookie },
      payload: { title: "B secret", body: "not A's", ownerUserId: ownA.json().memory.id },
    });
    expect(forged.statusCode).toBe(201);
    const listAfterForge = await app.inject({ method: "GET", url: "/v1/memories", headers: { cookie: authorA.cookie } });
    expect(listAfterForge.json().memories.map((item: { title: string }) => item.title)).not.toContain("B secret");

    const contact = await app.inject({
      method: "POST",
      url: "/v1/contacts",
      headers: { cookie: authorA.cookie },
      payload: { displayName: "A contact", email: "contact.a@example.test", phone: "+1 555 010 0199", roles: ["trusted_contact"] },
    });
    const contactId = contact.json().contact.id as string;
    const stolenContact = await app.inject({
      method: "PATCH",
      url: `/v1/contacts/${contactId}`,
      headers: { cookie: authorB.cookie },
      payload: { displayName: "stolen" },
    });
    expect(stolenContact.statusCode).toBe(404);
    const contactsB = await app.inject({ method: "GET", url: "/v1/contacts", headers: { cookie: authorB.cookie } });
    expect(contactsB.json().contacts).toEqual([]);

    const profile = await app.inject({ method: "GET", url: "/v1/auth/me", headers: { cookie: authorB.cookie } });
    expect(profile.json().user.email).toBe("user.b@example.test");
    const deliveries = await app.inject({ method: "GET", url: "/v1/deliveries", headers: { cookie: authorB.cookie } });
    expect(deliveries.json().deliveries).toEqual([]);

    const privateData = await app.inject({ method: "GET", url: "/v1/memories" });
    expect(privateData.statusCode).toBe(401);
    const badId = await app.inject({ method: "GET", url: "/v1/memories/not-a-uuid", headers: { cookie: authorA.cookie } });
    expect(badId.statusCode).toBe(404);
    expect(badId.json().error.message).toBe("Memory not found.");
  });

  it("requires a verified email before scheduling and rejects a reused verification token", async () => {
    const author = await registerUser(app, "unverified@example.test");
    const draft = await memory(author.cookie, "Waiting");
    const blocked = await app.inject({
      method: "POST",
      url: `/v1/memories/${draft.id}/schedule`,
      headers: { cookie: author.cookie },
      payload: {},
    });
    expect(blocked.statusCode).toBe(403);
    expect(blocked.json().error.code).toBe("EMAIL_NOT_VERIFIED");

    const first = await app.inject({
      method: "POST",
      url: "/v1/auth/verify-email",
      headers: { cookie: author.cookie },
      payload: { token: author.token },
    });
    expect(first.statusCode).toBe(200);
    const again = await app.inject({
      method: "POST",
      url: "/v1/auth/verify-email",
      headers: { cookie: author.cookie },
      payload: { token: author.token },
    });
    expect(again.statusCode).toBe(400);
  });

  it("limits verification resends and completes password reset without revealing accounts", async () => {
    const author = await registerUser(app, "recover@example.test");
    const second = await app.inject({ method: "POST", url: "/v1/auth/verify-email/resend", headers: { cookie: author.cookie } });
    const third = await app.inject({ method: "POST", url: "/v1/auth/verify-email/resend", headers: { cookie: author.cookie } });
    const fourth = await app.inject({ method: "POST", url: "/v1/auth/verify-email/resend", headers: { cookie: author.cookie } });
    expect(second.statusCode).toBe(200);
    expect(third.statusCode).toBe(200);
    expect(fourth.statusCode).toBe(429);
    const oldCode = await app.inject({
      method: "POST",
      url: "/v1/auth/verify-email",
      headers: { cookie: author.cookie },
      payload: { token: author.token },
    });
    expect(oldCode.statusCode).toBe(400);
    const latest = third.json().devVerificationToken as string;
    expect(latest).toBeTruthy();
    expect(String(latest)).not.toBe(author.token);
    const confirmed = await app.inject({
      method: "POST",
      url: "/v1/auth/verify-email",
      payload: { token: latest },
    });
    expect(confirmed.statusCode).toBe(200);

    const unknown = await app.inject({
      method: "POST",
      url: "/v1/auth/forgot-password",
      payload: { email: "nobody@example.test" },
    });
    const known = await app.inject({
      method: "POST",
      url: "/v1/auth/forgot-password",
      payload: { email: "recover@example.test" },
    });
    expect(unknown.statusCode).toBe(200);
    expect(known.json()).toEqual(unknown.json());
    expect(JSON.stringify(known.json())).not.toMatch(/token/i);

    const firstLink = await app.inject({
      method: "POST",
      url: "/v1/auth/forgot-password",
      payload: { email: "recover@example.test" },
    });
    expect(firstLink.statusCode).toBe(200);
    const messages = await app.prisma.devMessage.findMany({
      where: { templateId: "password_reset", destination: "recover@example.test" },
      orderBy: { createdAt: "asc" },
    });
    const tokens = messages.map((message) => (message.variables as { code?: string }).code).filter(Boolean);
    expect(tokens.length).toBeGreaterThan(1);
    const stale = await app.inject({
      method: "POST",
      url: "/v1/auth/reset-password",
      payload: { token: tokens[0], password: "Replacement-1" },
    });
    expect(stale.statusCode).toBe(400);

    const current = tokens[tokens.length - 1] as string;
    await app.prisma.passwordResetToken.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
    const expired = await app.inject({
      method: "POST",
      url: "/v1/auth/reset-password",
      payload: { token: current, password: "Replacement-1" },
    });
    expect(expired.statusCode).toBe(400);
    const unchanged = await app.inject({
      method: "POST",
      url: "/v1/auth/login",
      payload: { email: "recover@example.test", password: "Correct-Horse-1" },
    });
    expect(unchanged.statusCode).toBe(200);

    const fresh = await app.inject({
      method: "POST",
      url: "/v1/auth/forgot-password",
      payload: { email: "recover@example.test" },
    });
    expect(fresh.statusCode).toBe(200);
    const freshMessage = await app.prisma.devMessage.findFirst({
      where: { templateId: "password_reset", destination: "recover@example.test" },
      orderBy: { createdAt: "desc" },
    });
    const resetToken = (freshMessage?.variables as { code?: string }).code as string;
    expect(freshMessage?.variables).toMatchObject({ link: expect.stringContaining("/reset-password?token=") });
    const reset = await app.inject({
      method: "POST",
      url: "/v1/auth/reset-password",
      payload: { token: resetToken, password: "Replacement-1" },
    });
    expect(reset.statusCode).toBe(200);
    const reused = await app.inject({
      method: "POST",
      url: "/v1/auth/reset-password",
      payload: { token: resetToken, password: "Another-Pass-2" },
    });
    expect(reused.statusCode).toBe(400);
    const oldSession = await app.inject({ method: "GET", url: "/v1/auth/me", headers: { cookie: sessionCookie(unchanged) } });
    expect(oldSession.statusCode).toBe(401);
    const changed = await app.prisma.devMessage.findFirst({
      where: { templateId: "password_changed", destination: "recover@example.test" },
    });
    expect(changed).toBeTruthy();
    const stored = await app.prisma.user.findUniqueOrThrow({ where: { email: "recover@example.test" } });
    expect(stored.passwordHash.startsWith("$argon2id$")).toBe(true);
    expect(stored.passwordHash).not.toContain("Replacement-1");

    const loggedIn = await app.inject({
      method: "POST",
      url: "/v1/auth/login",
      payload: { email: "recover@example.test", password: "Replacement-1" },
    });
    const other = await app.inject({
      method: "POST",
      url: "/v1/auth/login",
      payload: { email: "recover@example.test", password: "Replacement-1" },
    });
    const cookie = sessionCookie(loggedIn);
    const changedPassword = await app.inject({
      method: "POST",
      url: "/v1/auth/password",
      headers: { cookie },
      payload: { currentPassword: "Replacement-1", newPassword: "Updated-Pass-3" },
    });
    expect(changedPassword.statusCode).toBe(200);
    const kept = await app.inject({ method: "GET", url: "/v1/auth/me", headers: { cookie } });
    const dropped = await app.inject({ method: "GET", url: "/v1/auth/me", headers: { cookie: sessionCookie(other) } });
    expect(kept.statusCode).toBe(200);
    expect(dropped.statusCode).toBe(401);

    await app.prisma.session.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
    const expiredSession = await app.inject({ method: "GET", url: "/v1/auth/me", headers: { cookie } });
    expect(expiredSession.statusCode).toBe(401);
  });

  it("rate limits failed sign-ins with one message for unknown and known emails", async () => {
    await registerUser(app, "limit.security@example.test");
    const unknown = await app.inject({
      method: "POST",
      url: "/v1/auth/login",
      payload: { email: "missing@example.test", password: "wrong-password-1" },
    });
    const known = await app.inject({
      method: "POST",
      url: "/v1/auth/login",
      payload: { email: "limit.security@example.test", password: "wrong-password-1" },
    });
    expect(unknown.json().error.message).toBe(known.json().error.message);
    for (let i = 0; i < 7; i += 1) {
      await app.inject({
        method: "POST",
        url: "/v1/auth/login",
        payload: { email: "limit.security@example.test", password: "wrong-password-1" },
      });
    }
    const blocked = await app.inject({
      method: "POST",
      url: "/v1/auth/login",
      payload: { email: "limit.security@example.test", password: "Correct-Horse-1" },
    });
    expect(blocked.statusCode).toBe(429);
  });

  it("enforces file type, size, quota, and signed-link expiry on the server", async () => {
    const author = await registerUser(app, "files@example.test");
    const other = await registerUser(app, "files-b@example.test");
    const draft = await memory(author.cookie, "With a photo");
    const disguised = await attach(author.cookie, draft.id, Buffer.from("<html>not a png</html>"), "note.png", "image/png");
    const document = await attach(author.cookie, draft.id, Buffer.from("%PDF-1.4"), "note.pdf", "application/pdf");
    expect(disguised.statusCode).toBe(400);
    expect(document.statusCode).toBe(400);

    const previousPhoto = env.MAX_PHOTO_BYTES;
    const previousCount = env.MAX_UPLOADS_PER_USER;
    try {
      env.MAX_PHOTO_BYTES = 8;
      const oversized = await attach(author.cookie, draft.id, Buffer.concat([png, Buffer.alloc(16)]), "big.png", "image/png");
      expect(oversized.statusCode).toBe(400);
      expect(oversized.json().error.code).toBe("FILE_TOO_LARGE");

      env.MAX_PHOTO_BYTES = previousPhoto;
      env.MAX_UPLOADS_PER_USER = 1;
      const first = await attach(author.cookie, draft.id, png, "one.png", "image/png");
      const second = await attach(author.cookie, draft.id, png, "two.png", "image/png");
      expect(first.statusCode).toBe(201);
      expect(second.statusCode).toBe(400);
      expect(second.json().error.code).toBe("UPLOAD_LIMIT");

      const assetId = first.json().attachment.id as string;
      const link = await app.inject({ method: "POST", url: `/v1/media/${assetId}/signed-url`, headers: { cookie: author.cookie } });
      expect(link.statusCode).toBe(200);
      const url = link.json().url as string;
      expect(url.startsWith("/v1/media/signed/")).toBe(true);
      const open = await app.inject({ method: "GET", url });
      expect(open.statusCode).toBe(200);
      expect(open.headers["cache-control"]).toBe("private, no-store");
      await app.prisma.mediaAccessToken.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
      const expired = await app.inject({ method: "GET", url });
      expect(expired.statusCode).toBe(401);
      const otherLink = await app.inject({ method: "POST", url: `/v1/media/${assetId}/signed-url`, headers: { cookie: other.cookie } });
      expect(otherLink.statusCode).toBe(404);
      const logged = await app.prisma.auditEvent.findFirst({ where: { action: "media.signed_read", entityId: assetId } });
      expect(logged).toBeTruthy();
      expect(JSON.stringify(logged?.metadata ?? {})).not.toContain(url.split("/").pop());
    } finally {
      env.MAX_PHOTO_BYTES = previousPhoto;
      env.MAX_UPLOADS_PER_USER = previousCount;
    }
  });
});
