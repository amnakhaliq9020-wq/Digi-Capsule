import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { OFFICIAL_FROM, OFFICIAL_SENDER_ADDRESS, capturedMail, setMailRuntime } from "../lib/mail";
import { runWorkerTick } from "../services/worker-tick";
import { createApp, registerUser, resetDatabase, verifyEmail } from "./helpers";

const app = await createApp();
afterAll(async () => app.close());

beforeEach(async () => {
  process.env.NODE_ENV = "test";
  process.env.DIGI_TEST_MODE = "true";
  process.env.ADMIN_EMAILS = "";
  capturedMail.length = 0;
  setMailRuntime(null);
  await resetDatabase(app);
});

describe("email recipients", () => {
  it("sends a test from the official sender to the address the administrator entered", async () => {
    const admin = await registerUser(app, "admin@example.test", "Admin");
    process.env.ADMIN_EMAILS = "admin@example.test";

    const missing = await app.inject({
      method: "POST",
      url: "/v1/settings/test-email",
      headers: { cookie: admin.cookie },
      payload: { confirm: true },
    });
    expect(missing.statusCode).toBe(400);

    const sent = await app.inject({
      method: "POST",
      url: "/v1/settings/test-email",
      headers: { cookie: admin.cookie },
      payload: { to: "test@example.com", confirm: true },
    });
    expect(sent.statusCode).toBe(200);
    expect(sent.json().recipient).toBe("test@example.com");
    expect(sent.json().from).toBe(OFFICIAL_FROM);
    expect(capturedMail).toEqual([
      {
        from: OFFICIAL_FROM,
        replyTo: OFFICIAL_SENDER_ADDRESS,
        to: "test@example.com",
        subject: "Digi Capsule Email Configuration",
      },
    ]);
    expect(capturedMail.some((message) => message.to === OFFICIAL_SENDER_ADDRESS)).toBe(false);
    const body = JSON.stringify(sent.json());
    expect(body.includes("password")).toBe(false);
    if (process.env.SMTP_PASSWORD) expect(body.includes(process.env.SMTP_PASSWORD)).toBe(false);
  });

  it("rejects SMTP changes and status reads from anyone who is not an administrator", async () => {
    const author = await registerUser(app, "owner@example.test", "Owner");
    const stranger = await registerUser(app, "stranger@example.test", "Stranger");
    process.env.ADMIN_EMAILS = "owner@example.test";
    const denied = await app.inject({
      method: "PUT",
      url: "/v1/settings/smtp",
      headers: { cookie: stranger.cookie },
      payload: { host: "smtp.example.test", port: 587, username: "mailer", password: "not-the-real-secret", encryption: "starttls" },
    });
    expect(denied.statusCode).toBe(403);
    const hidden = await app.inject({ method: "GET", url: "/v1/settings/smtp", headers: { cookie: stranger.cookie } });
    expect(hidden.statusCode).toBe(403);

    const saved = await app.inject({
      method: "PUT",
      url: "/v1/settings/smtp",
      headers: { cookie: author.cookie },
      payload: { host: "smtp.example.test", port: 587, username: "mailer", password: "not-the-real-secret", encryption: "starttls" },
    });
    expect(saved.statusCode).toBe(200);
    const view = saved.json();
    expect(view.status.connection).toBe("unverified");
    expect(JSON.stringify(view).includes("not-the-real-secret")).toBe(false);
    expect(view.server.passwordSet).toBe(true);
    expect(view.server.password).toBeUndefined();
  });

  it("keeps registration, password reset, and check-in mail on the account address", async () => {
    const author = await registerUser(app, "owner-mail@example.test", "Owner Mail");
    const verification = await app.prisma.devMessage.findFirstOrThrow({ where: { templateId: "email_verification" } });
    expect(verification.destination).toBe("owner-mail@example.test");

    const reset = await app.inject({
      method: "POST",
      url: "/v1/auth/forgot-password",
      payload: { email: "owner-mail@example.test" },
    });
    expect(reset.statusCode).toBe(200);
    const resetMail = await app.prisma.devMessage.findFirstOrThrow({ where: { templateId: "password_reset" } });
    expect(resetMail.destination).toBe("owner-mail@example.test");

    await verifyEmail(app, author.cookie, author.token);
    const cycle = await app.prisma.checkInCycle.findFirstOrThrow({ where: { userId: author.body.user.id, state: "due" } });
    await app.prisma.devClock.upsert({
      where: { id: 1 },
      create: { id: 1, simulatedNow: cycle.dueAt },
      update: { simulatedNow: cycle.dueAt },
    });
    await runWorkerTick(app.prisma, { simulated: true });
    const warning = await app.prisma.devMessage.findFirstOrThrow({ where: { templateId: "check_in_due" } });
    expect(warning.destination).toBe("owner-mail@example.test");
    expect(warning.destination).not.toBe(OFFICIAL_SENDER_ADDRESS);
  });
});
