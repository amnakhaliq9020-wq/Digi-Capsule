import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { isVerificationReleaseEnabled } from "../env";
import { createApp, registerUser, resetDatabase, sessionCookie } from "./helpers";

const app = await createApp();

beforeAll(async () => undefined);
afterAll(async () => {
  await app.close();
});
beforeEach(async () => {
  await resetDatabase(app);
});

describe("authentication", () => {
  it("registers, logs in, keeps a session, and logs out", async () => {
    const registered = await registerUser(app, "author@example.test");
    expect(registered.response.statusCode).toBe(201);
    const me = await app.inject({ method: "GET", url: "/v1/auth/me", headers: { cookie: registered.cookie } });
    expect(me.statusCode).toBe(200);
    expect(me.json().user.email).toBe("author@example.test");

    const loggedOut = await app.inject({ method: "POST", url: "/v1/auth/logout", headers: { cookie: registered.cookie } });
    expect(loggedOut.statusCode).toBe(200);
    const after = await app.inject({ method: "GET", url: "/v1/auth/me", headers: { cookie: registered.cookie } });
    expect(after.statusCode).toBe(401);

    const login = await app.inject({
      method: "POST",
      url: "/v1/auth/login",
      payload: { email: "author@example.test", password: "Correct-Horse-1" },
    });
    expect(login.statusCode).toBe(200);
    const again = await app.inject({ method: "GET", url: "/v1/auth/me", headers: { cookie: sessionCookie(login) } });
    expect(again.statusCode).toBe(200);
  });

  it("stores an Argon2id hash and rejects a bad password", async () => {
    await registerUser(app, "hash@example.test");
    const user = await app.prisma.user.findUniqueOrThrow({ where: { email: "hash@example.test" } });
    expect(user.passwordHash.startsWith("$argon2id$")).toBe(true);
    expect(user.passwordHash).not.toContain("Correct-Horse-1");
    const bad = await app.inject({
      method: "POST",
      url: "/v1/auth/login",
      payload: { email: "hash@example.test", password: "wrong-password-1" },
    });
    expect(bad.statusCode).toBe(401);
    expect(bad.json().error.message).toBe("Email or password is incorrect.");
  });

  it("rejects a duplicate email and an invalid email", async () => {
    await registerUser(app, "dup@example.test");
    const again = await app.inject({
      method: "POST",
      url: "/v1/auth/register",
      payload: { displayName: "Other", email: "dup@example.test", password: "Correct-Horse-1", timeZone: "UTC" },
    });
    expect(again.statusCode).toBe(409);
    const invalid = await app.inject({
      method: "POST",
      url: "/v1/auth/register",
      payload: { displayName: "Other", email: "not-an-email", password: "Correct-Horse-1", timeZone: "UTC" },
    });
    expect(invalid.statusCode).toBe(400);
    expect(invalid.json().error.message).toMatch(/email/i);
  });

  it("rate limits repeated failed sign-ins", async () => {
    await registerUser(app, "limit@example.test");
    for (let i = 0; i < 8; i += 1) {
      const attempt = await app.inject({
        method: "POST",
        url: "/v1/auth/login",
        payload: { email: "limit@example.test", password: "wrong-password-1" },
      });
      expect(attempt.statusCode).toBe(401);
    }
    const blocked = await app.inject({
      method: "POST",
      url: "/v1/auth/login",
      payload: { email: "limit@example.test", password: "Correct-Horse-1" },
    });
    expect(blocked.statusCode).toBe(429);
  });

  it("keeps death-related release disabled in production even if the flag is set", () => {
    const previousNode = process.env.NODE_ENV;
    const previousFlag = process.env.VERIFICATION_RELEASES_ENABLED;
    process.env.NODE_ENV = "production";
    process.env.VERIFICATION_RELEASES_ENABLED = "true";
    expect(isVerificationReleaseEnabled()).toBe(false);
    process.env.NODE_ENV = previousNode;
    process.env.VERIFICATION_RELEASES_ENABLED = previousFlag;
  });
});
