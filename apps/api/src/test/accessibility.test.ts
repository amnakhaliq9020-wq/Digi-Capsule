import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createApp, registerUser, resetDatabase, sessionCookie } from "./helpers";

const app = await createApp();
afterAll(async () => app.close());
beforeEach(async () => resetDatabase(app));

const prefs = {
  colorVision: "deuteranopia",
  highContrast: true,
  largeText: true,
  reducedMotion: true,
};

describe("accessibility preferences", () => {
  it("saves color-vision settings on the account and returns them after a new login", async () => {
    const author = await registerUser(app, "vision@example.test", "Vision");
    const saved = await app.inject({
      method: "PATCH",
      url: "/v1/auth/me",
      headers: { cookie: author.cookie },
      payload: { accessibility: prefs },
    });
    expect(saved.statusCode).toBe(200);
    expect(saved.json().user.accessibility).toEqual(prefs);

    await app.inject({ method: "POST", url: "/v1/auth/logout", headers: { cookie: author.cookie } });
    const login = await app.inject({
      method: "POST",
      url: "/v1/auth/login",
      payload: { email: "vision@example.test", password: "Correct-Horse-1" },
    });
    const again = await app.inject({ method: "GET", url: "/v1/auth/me", headers: { cookie: sessionCookie(login) } });
    expect(again.json().user.accessibility).toEqual(prefs);
  });
});
