import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { addVerifiedContact, createApp, registerUser, resetDatabase, verifyEmail } from "./helpers";

const app = await createApp();
afterAll(async () => app.close());
beforeEach(async () => {
  process.env.VERIFICATION_RELEASES_ENABLED = "false";
  await resetDatabase(app);
});

describe("test console isolation", () => {
  it("does not show another account's verification code or letter in the test inbox", async () => {
    const author = await registerUser(app, "owner@example.test", "Owner");
    const other = await registerUser(app, "other@example.test", "Other");
    await verifyEmail(app, author.cookie, author.token);
    const recipient = await addVerifiedContact(app, author.cookie, {
      displayName: "Avery",
      email: "avery-isolated@example.test",
    });
    const created = await app.inject({
      method: "POST",
      url: "/v1/memories",
      headers: { cookie: author.cookie },
      payload: { title: "Private", body: "ISOLATED_LETTER_PHRASE" },
    });
    const id = created.json().memory.id as string;
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
        recipientIds: [recipient.id],
      },
    });
    expect(scheduled.statusCode).toBe(200);
    await app.inject({
      method: "POST",
      url: "/v1/dev/clock",
      headers: { cookie: author.cookie },
      payload: { simulatedNow: "2026-06-02T09:00:00.000Z" },
    });
    const foreignTick = await app.inject({ method: "POST", url: "/v1/dev/worker/tick", headers: { cookie: other.cookie } });
    expect(foreignTick.json().calendarJobsSent).toBe(0);
    const ownTick = await app.inject({ method: "POST", url: "/v1/dev/worker/tick", headers: { cookie: author.cookie } });
    expect(ownTick.json().calendarJobsSent).toBe(1);

    const foreignInbox = await app.inject({ method: "GET", url: "/v1/dev/inbox", headers: { cookie: other.cookie } });
    const foreignText = JSON.stringify(foreignInbox.json());
    expect(foreignText).not.toContain("ISOLATED_LETTER_PHRASE");
    expect(foreignText).not.toContain(author.token);

    const ownInbox = await app.inject({ method: "GET", url: "/v1/dev/inbox", headers: { cookie: author.cookie } });
    expect(JSON.stringify(ownInbox.json())).toContain("ISOLATED_LETTER_PHRASE");
  });
});
