import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { exactInstant } from "@digi/domain";
import { addVerifiedContact, createApp, registerUser, resetDatabase, verifyEmail } from "./helpers";
import { runWorkerTick } from "../services/worker-tick";

const app = await createApp();
const DAY_MS = 24 * 60 * 60 * 1000;
afterAll(async () => app.close());
beforeEach(async () => {
  process.env.NODE_ENV = "test";
  process.env.DIGI_TEST_MODE = "true";
  process.env.VERIFICATION_RELEASES_ENABLED = "false";
  await resetDatabase(app);
});

function localDate(instant: Date, timeZone: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(instant);
}

describe("real server time for normal users", () => {
  it("ignores the simulated clock for scheduling, check-in, and the automatic worker", async () => {
    const author = await registerUser(app, "realtime@example.test", "Real Time");
    await verifyEmail(app, author.cookie, author.token);
    const recipient = await addVerifiedContact(app, author.cookie, { displayName: "Sam", email: "sam-realtime@example.test" });
    await app.inject({
      method: "POST",
      url: "/v1/dev/clock",
      headers: { cookie: author.cookie },
      payload: { simulatedNow: "2099-01-01T00:00:00.000Z" },
    });

    process.env.NODE_ENV = "development";
    try {
      const health = await app.inject({ method: "GET", url: "/v1/health" });
      expect(health.json().schedulingClock).toBe("server");
      expect(Math.abs(Date.parse(health.json().serverTime) - Date.now())).toBeLessThan(5_000);

      const created = await app.inject({
        method: "POST",
        url: "/v1/memories",
        headers: { cookie: author.cookie },
        payload: { title: "Real date", body: "A letter" },
      });
      const id = created.json().memory.id as string;
      const past = await app.inject({
        method: "POST",
        url: `/v1/memories/${id}/schedule`,
        headers: { cookie: author.cookie },
        payload: {
          mode: "on_date",
          localDate: localDate(new Date(Date.now() - DAY_MS), "Asia/Karachi"),
          localTime: "09:00",
          timeZone: "Asia/Karachi",
          recipientIds: [recipient.id],
        },
      });
      expect(past.statusCode).toBe(400);
      expect(past.json().error.message).toContain("already in the past");
      expect(past.json().error.message).not.toContain("2099");

      const when = new Date(Date.now() + 3 * DAY_MS);
      const date = localDate(when, "Asia/Karachi");
      const saved = await app.inject({
        method: "POST",
        url: `/v1/memories/${id}/schedule`,
        headers: { cookie: author.cookie },
        payload: { mode: "on_date", localDate: date, localTime: "09:00", timeZone: "Asia/Karachi", recipientIds: [recipient.id] },
      });
      expect(saved.statusCode).toBe(200);
      expect(saved.json().memory.schedule.nextRunAt).toBe(exactInstant(date, "09:00", "Asia/Karachi").toISOString());

      const spring = await app.inject({
        method: "POST",
        url: `/v1/memories/${id}/schedule`,
        headers: { cookie: author.cookie },
        payload: { mode: "on_date", localDate: "2027-03-14", localTime: "02:30", timeZone: "America/New_York", recipientIds: [recipient.id] },
      });
      expect(spring.statusCode).toBe(200);
      expect(spring.json().memory.schedule.nextRunAt).toBe(exactInstant("2027-03-14", "02:30", "America/New_York").toISOString());

      const alive = await app.inject({ method: "POST", url: "/v1/check-in", headers: { cookie: author.cookie } });
      expect(alive.statusCode).toBe(200);
      const nextDue = Date.parse(alive.json().nextCheckInDueAt);
      expect(nextDue).toBeGreaterThan(Date.now() + 29 * DAY_MS);
      expect(nextDue).toBeLessThan(Date.now() + 30 * DAY_MS + 5_000);

      const status = await app.inject({ method: "GET", url: "/v1/check-in", headers: { cookie: author.cookie } });
      expect(status.json().warningStage).toBe("on_time");
      expect(status.json().daysOverdue).toBe(0);

      const quiet = await runWorkerTick(app.prisma);
      expect(quiet.remindersSent).toBe(0);
      expect(quiet.calendarJobsSent).toBe(0);
      expect(quiet.simulatedReleasesRecorded).toBe(0);

      const zone = await app.inject({
        method: "PATCH",
        url: "/v1/auth/me",
        headers: { cookie: author.cookie },
        payload: { timeZone: "Asia/Karachi" },
      });
      expect(zone.statusCode).toBe(200);
      expect(zone.json().user.timeZone).toBe("Asia/Karachi");
      const me = await app.inject({ method: "GET", url: "/v1/auth/me", headers: { cookie: author.cookie } });
      expect(me.json().user.timeZone).toBe("Asia/Karachi");

      const clock = await app.inject({ method: "GET", url: "/v1/dev/clock", headers: { cookie: author.cookie } });
      expect(clock.statusCode).toBe(200);
      expect(clock.json().simulatedNow).toContain("2099-01-01");
    } finally {
      process.env.NODE_ENV = "test";
    }
  });

  it("lets the developer tick use the simulated clock without changing a real check-in", async () => {
    const author = await registerUser(app, "split-clock@example.test");
    await verifyEmail(app, author.cookie, author.token);
    const before = await app.inject({ method: "GET", url: "/v1/check-in", headers: { cookie: author.cookie } });
    await app.inject({
      method: "POST",
      url: "/v1/dev/clock",
      headers: { cookie: author.cookie },
      payload: { simulatedNow: new Date(Date.parse(before.json().nextCheckInDueAt) + 21 * DAY_MS).toISOString() },
    });
    process.env.NODE_ENV = "development";
    try {
      const realTick = await runWorkerTick(app.prisma);
      expect(realTick.remindersSent).toBe(0);
      const simulated = await runWorkerTick(app.prisma, { simulated: true });
      expect(simulated.remindersSent).toBeGreaterThan(0);
      const second = await runWorkerTick(app.prisma, { simulated: true });
      expect(second.remindersSent).toBe(0);
    } finally {
      process.env.NODE_ENV = "test";
    }
  });
});
