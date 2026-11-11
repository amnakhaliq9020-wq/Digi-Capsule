import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createApp, resetDatabase } from "./helpers";

const app = await createApp();

afterAll(async () => {
  await app.close();
});
beforeEach(async () => {
  await resetDatabase(app);
});

describe("waitlist", () => {
  it("stores a valid email and recognizes a repeat", async () => {
    const joined = await app.inject({ method: "POST", url: "/v1/waitlist", payload: { email: "Ada@Example.test" } });
    expect(joined.statusCode).toBe(200);
    expect(joined.json()).toEqual({ status: "joined" });
    const stored = await app.prisma.waitlistEntry.findUniqueOrThrow({ where: { email: "ada@example.test" } });
    expect(stored.email).toBe("ada@example.test");

    const again = await app.inject({ method: "POST", url: "/v1/waitlist", payload: { email: "ada@example.test" } });
    expect(again.statusCode).toBe(200);
    expect(again.json()).toEqual({ status: "already_joined" });
    expect(await app.prisma.waitlistEntry.count()).toBe(1);
  });

  it("rejects an invalid email", async () => {
    const rejected = await app.inject({ method: "POST", url: "/v1/waitlist", payload: { email: "not-an-email" } });
    expect(rejected.statusCode).toBe(400);
    expect(rejected.json().error.message).toMatch(/email/i);
    expect(await app.prisma.waitlistEntry.count()).toBe(0);
  });
});
