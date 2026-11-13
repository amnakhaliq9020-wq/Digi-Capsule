import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { addVerifiedContact, createApp, multipart, png, registerUser, resetDatabase, verifyEmail } from "./helpers";

const app = await createApp();
afterAll(async () => app.close());

beforeEach(async () => {
  process.env.NODE_ENV = "test";
  process.env.DIGI_TEST_MODE = "true";
  process.env.VERIFICATION_RELEASES_ENABLED = "false";
  await resetDatabase(app);
});

async function pair() {
  const userA = await registerUser(app, "isolate.a@example.test", "User A");
  const userB = await registerUser(app, "isolate.b@example.test", "User B");
  await verifyEmail(app, userA.cookie, userA.token);
  await verifyEmail(app, userB.cookie, userB.token);
  return { userA, userB };
}

describe("two-account isolation", () => {
  it("denies every cross-account read, write, download, and release", async () => {
    const { userA, userB } = await pair();
    const contactA = await addVerifiedContact(app, userA.cookie, {
      displayName: "Avery",
      email: "isolate-avery@example.test",
      phone: "+1 555 010 0201",
    });
    const contactB = await addVerifiedContact(app, userB.cookie, {
      displayName: "Blair",
      email: "isolate-blair@example.test",
      phone: "+1 555 010 0202",
    });
    const memoryA = await app.inject({
      method: "POST",
      url: "/v1/memories",
      headers: { cookie: userA.cookie },
      payload: { title: "A letter", body: "PRIVATE_A_LETTER", ownerUserId: userB.body.user.id, capsuleId: "forged" },
    });
    const memoryB = await app.inject({
      method: "POST",
      url: "/v1/memories",
      headers: { cookie: userB.cookie },
      payload: { title: "B letter", body: "PRIVATE_B_LETTER" },
    });
    expect(memoryA.statusCode).toBe(201);
    expect(memoryB.statusCode).toBe(201);
    const idA = memoryA.json().memory.id as string;
    const idB = memoryB.json().memory.id as string;
    const upload = multipart(png, "a-only.png", "image/png");
    const uploaded = await app.inject({
      method: "POST",
      url: `/v1/memories/${idA}/attachments`,
      headers: { cookie: userA.cookie, ...upload.headers },
      payload: upload.body,
    });
    expect(uploaded.statusCode).toBe(201);
    const assetId = uploaded.json().attachment.id as string;

    const denied = async (method: "GET" | "POST" | "PATCH" | "DELETE", url: string, cookie: string, payload?: unknown) => {
      const response = await app.inject({ method, url, headers: { cookie }, payload });
      expect(response.statusCode).toBeGreaterThanOrEqual(403);
      expect(JSON.stringify(response.json())).not.toContain("PRIVATE_A_LETTER");
      expect(JSON.stringify(response.json())).not.toContain("PRIVATE_B_LETTER");
      return response;
    };

    await denied("GET", `/v1/memories/${idB}`, userA.cookie);
    await denied("PATCH", `/v1/memories/${idB}`, userA.cookie, { title: "taken", body: "taken" });
    await denied("DELETE", `/v1/memories/${idB}`, userA.cookie);
    await denied("POST", `/v1/memories/${idB}/cancel`, userA.cookie);
    await denied("POST", `/v1/memories/${idB}/schedule`, userA.cookie, { mode: "if_i_am_gone", recipientIds: [contactA.id] });
    const stolenUpload = await app.inject({
      method: "POST",
      url: `/v1/memories/${idA}/attachments`,
      headers: { cookie: userB.cookie, ...upload.headers },
      payload: upload.body,
    });
    expect(stolenUpload.statusCode).toBe(404);
    await denied("DELETE", `/v1/memories/${idA}/attachments/${assetId}`, userB.cookie);
    await denied("GET", `/v1/media/${assetId}/content`, userB.cookie);
    await denied("POST", `/v1/media/${assetId}/signed-url`, userB.cookie);
    await denied("GET", `/v1/memories/${idA}/shares`, userB.cookie);
    await denied("POST", `/v1/memories/${idA}/media/${assetId}/shares`, userB.cookie, { recipientId: contactB.id, expiresInHours: 24 });
    await denied("PATCH", `/v1/contacts/${contactA.id}`, userB.cookie, { displayName: "stolen" });
    await denied("DELETE", `/v1/contacts/${contactA.id}`, userB.cookie);
    await denied("POST", `/v1/contacts/${contactA.id}/verification`, userB.cookie);
    await denied("GET", `/v1/memories/${idA}`, userB.cookie);

    const forgedRecipient = await app.inject({
      method: "POST",
      url: `/v1/memories/${idA}/schedule`,
      headers: { cookie: userA.cookie },
      payload: { mode: "if_i_am_gone", recipientIds: [contactB.id] },
    });
    expect(forgedRecipient.statusCode).toBe(404);
    expect((await app.prisma.capsuleItem.findUniqueOrThrow({ where: { id: idA } })).status).toBe("draft");
    expect((await app.prisma.capsuleItem.findUniqueOrThrow({ where: { id: idB } })).title).toBe("B letter");
    expect((await app.prisma.person.findUniqueOrThrow({ where: { id: contactA.id } })).displayName).toBe("Avery");

    const [dashA, dashB] = await Promise.all([
      app.inject({ method: "GET", url: "/v1/dashboard", headers: { cookie: userA.cookie } }),
      app.inject({ method: "GET", url: "/v1/dashboard", headers: { cookie: userB.cookie } }),
    ]);
    expect(dashA.json().totalMemories).toBe(1);
    expect(dashB.json().totalMemories).toBe(1);
    expect(JSON.stringify(dashA.json())).not.toContain("PRIVATE_B_LETTER");
    expect(JSON.stringify(dashB.json())).not.toContain("PRIVATE_A_LETTER");

    const checkA = await app.inject({ method: "GET", url: "/v1/check-in", headers: { cookie: userA.cookie } });
    const before = checkA.json().nextCheckInDueAt as string;
    await app.inject({ method: "POST", url: "/v1/check-in", headers: { cookie: userB.cookie } });
    await app.inject({ method: "POST", url: "/v1/check-in/pause", headers: { cookie: userB.cookie } });
    const checkAAfter = await app.inject({ method: "GET", url: "/v1/check-in", headers: { cookie: userA.cookie } });
    expect(checkAAfter.json().nextCheckInDueAt).toBe(before);
    expect(checkAAfter.json().pausedUntil).toBeNull();
    const meA = await app.inject({ method: "GET", url: "/v1/auth/me", headers: { cookie: userA.cookie } });
    expect(meA.json().user.email).toBe("isolate.a@example.test");
    const noticesB = await app.inject({ method: "GET", url: "/v1/settings/notifications", headers: { cookie: userB.cookie } });
    expect(noticesB.json().notifications.every((row: { userId?: string }) => row.userId === undefined || row.userId === userB.body.user.id)).toBe(true);
    const smtp = await app.inject({ method: "GET", url: "/v1/settings/smtp", headers: { cookie: userA.cookie } });
    expect(smtp.statusCode).toBe(403);

    const anonymous = await app.inject({ method: "GET", url: `/v1/memories/${idA}` });
    const forgedCookie = await app.inject({ method: "GET", url: `/v1/memories/${idA}`, headers: { cookie: "digi_session=not-a-real-session" } });
    expect(anonymous.statusCode).toBe(401);
    expect(forgedCookie.statusCode).toBe(401);
    await app.prisma.session.updateMany({ where: { userId: userB.body.user.id }, data: { expiresAt: new Date("2020-01-01T00:00:00.000Z") } });
    const expired = await app.inject({ method: "GET", url: "/v1/auth/me", headers: { cookie: userB.cookie } });
    expect(expired.statusCode).toBe(401);

    const asset = await app.prisma.mediaAsset.findUniqueOrThrow({ where: { id: assetId } });
    const direct = await app.inject({ method: "GET", url: `/v1/${asset.storageKey}`, headers: { cookie: userB.cookie } });
    expect(direct.statusCode).toBe(404);
    expect(direct.body).not.toContain("PNG");
  });

  it("keeps share links, worker ticks, and the test inbox inside one account", async () => {
    const { userA, userB } = await pair();
    const contact = await addVerifiedContact(app, userA.cookie, {
      displayName: "User B",
      email: "isolate.b@example.test",
      phone: "+1 555 010 0203",
    });
    const created = await app.inject({
      method: "POST",
      url: "/v1/memories",
      headers: { cookie: userA.cookie },
      payload: { title: "Shared once", body: "PRIVATE_SHARE_LETTER" },
    });
    const memoryId = created.json().memory.id as string;
    const upload = multipart(png, "shared.png", "image/png");
    const uploaded = await app.inject({
      method: "POST",
      url: `/v1/memories/${memoryId}/attachments`,
      headers: { cookie: userA.cookie, ...upload.headers },
      payload: upload.body,
    });
    const assetId = uploaded.json().attachment.id as string;
    const cycle = await app.prisma.checkInCycle.findFirstOrThrow({ where: { userId: userA.body.user.id, state: "due" } });
    await app.inject({
      method: "POST",
      url: "/v1/dev/clock",
      headers: { cookie: userA.cookie },
      payload: { simulatedNow: new Date(cycle.dueAt.getTime() - 86_400_000).toISOString() },
    });
    await app.inject({
      method: "POST",
      url: `/v1/memories/${memoryId}/schedule`,
      headers: { cookie: userA.cookie },
      payload: { mode: "if_i_am_gone", recipientIds: [contact.id] },
    });
    const share = await app.inject({
      method: "POST",
      url: `/v1/memories/${memoryId}/media/${assetId}/shares`,
      headers: { cookie: userA.cookie },
      payload: { recipientId: contact.id, expiresInHours: 24 },
    });
    expect(share.statusCode).toBe(201);
    const token = String(share.json().share.url).split("#")[1];
    const ownerOpen = await app.inject({
      method: "POST",
      url: "/v1/media/shares/open",
      headers: { cookie: userA.cookie },
      payload: { token },
    });
    expect(ownerOpen.statusCode).toBe(403);
    expect(JSON.stringify(ownerOpen.json())).not.toContain("PRIVATE_SHARE_LETTER");
    const stranger = await app.inject({
      method: "POST",
      url: "/v1/media/shares/open",
      headers: { cookie: userB.cookie },
      payload: { token: `${token.slice(0, -2)}zz` },
    });
    expect(stranger.statusCode).toBe(404);
    const early = await app.inject({
      method: "POST",
      url: "/v1/media/shares/open",
      headers: { cookie: userB.cookie },
      payload: { token },
    });
    expect(early.statusCode).toBe(403);
    const received = await app.inject({ method: "GET", url: "/v1/received", headers: { cookie: userB.cookie } });
    expect(received.json().memories).toEqual([]);
    const revoke = await app.inject({
      method: "POST",
      url: `/v1/media/shares/${share.json().share.id}/revoke`,
      headers: { cookie: userB.cookie },
    });
    expect(revoke.statusCode).toBe(404);
    const revoked = await app.inject({
      method: "POST",
      url: `/v1/media/shares/${share.json().share.id}/revoke`,
      headers: { cookie: userA.cookie },
    });
    expect(revoked.statusCode).toBe(200);
    const reused = await app.inject({
      method: "POST",
      url: "/v1/media/shares/open",
      headers: { cookie: userB.cookie },
      payload: { token },
    });
    expect(reused.statusCode).toBe(403);
    expect(reused.json().error.code).toBe("LINK_REVOKED");

    await app.inject({
      method: "POST",
      url: "/v1/dev/clock",
      headers: { cookie: userB.cookie },
      payload: { simulatedNow: cycle.dueAt.toISOString() },
    });
    const foreignTick = await app.inject({ method: "POST", url: "/v1/dev/worker/tick", headers: { cookie: userB.cookie } });
    expect(foreignTick.json().remindersSent).toBe(0);
    expect(await app.prisma.notificationDelivery.count({ where: { userId: userA.body.user.id, templateId: "check_in_due" } })).toBe(0);

    await addVerifiedContact(app, userB.cookie, {
      displayName: "User A",
      email: "isolate.a@example.test",
      phone: "+1 555 010 0204",
    });
    await app.inject({ method: "POST", url: "/v1/auth/forgot-password", payload: { email: "isolate.a@example.test" } });
    const inbox = await app.inject({ method: "GET", url: "/v1/dev/inbox", headers: { cookie: userB.cookie } });
    const text = JSON.stringify(inbox.json());
    expect(text).not.toContain("PRIVATE_SHARE_LETTER");
    expect(text).not.toContain("password_reset");
    expect(text).not.toContain(userA.token);
    const own = await app.inject({ method: "GET", url: "/v1/dev/inbox", headers: { cookie: userA.cookie } });
    expect(JSON.stringify(own.json())).toContain("password_reset");
  });
});
