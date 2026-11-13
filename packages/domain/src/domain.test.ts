import { describe, expect, it } from "vitest";
import { canView } from "./can-view";
import { actionsForMissedCheckIn, dueReminderOffsets, nextDueAt, shouldRecordSimulatedRelease } from "./check-in";
import { calendarJobKey, checkInNoticeKey, memoryReadyKey } from "./idempotency";
import { ageEmbargoInstant, calendarDeliveryInstants, earliestDelivery, exactInstant, nextAnnualOccurrence } from "./schedule";
import { missedCheckInCreatesContentJob, verificationReducer } from "./verification";

const author = { kind: "author" as const, userId: "author-1" };
const recipient = { kind: "recipient" as const, userId: "recipient-1" };
const item = { ownerUserId: "author-1", status: "released" as const };

describe("canView", () => {
  it("lets the author see a draft", () => {
    expect(canView(author, { ...item, status: "draft" }, null)).toBe(true);
  });

  it("denies a recipient without a grant", () => {
    expect(canView(recipient, item, null)).toBe(false);
  });

  it("lets a recipient open a scheduled memory only after their own job is sent", () => {
    const grant = {
      linkedUserId: "recipient-1",
      visibility: "released_only" as const,
      revoked: false,
      jobStatus: "sent" as const,
    };
    expect(canView(recipient, { ...item, status: "scheduled" }, grant)).toBe(true);
    expect(canView(recipient, { ...item, status: "scheduled" }, { ...grant, jobStatus: "pending" })).toBe(false);
    expect(canView(recipient, { ...item, status: "scheduled" }, { ...grant, jobStatus: "uncertain" })).toBe(false);
    expect(canView(recipient, { ...item, status: "released" }, { ...grant, jobStatus: "delivered" })).toBe(true);
    expect(canView(recipient, { ...item, status: "cancelled" }, grant)).toBe(false);
  });

  it("denies a recipient grant on a draft", () => {
    expect(
      canView(recipient, { ...item, status: "draft" }, {
        linkedUserId: "recipient-1",
        visibility: "released_only",
        revoked: false,
        jobStatus: null,
      }),
    ).toBe(false);
  });

  it("allows a released item with a sent job", () => {
    expect(
      canView(recipient, item, {
        linkedUserId: "recipient-1",
        visibility: "released_only",
        revoked: false,
        jobStatus: "sent",
      }),
    ).toBe(true);
  });

  it("denies a trusted contact, another author, a revoked grant, and hidden visibility", () => {
    const grant = {
      linkedUserId: "recipient-1",
      visibility: "released_only" as const,
      revoked: false,
      jobStatus: "sent" as const,
    };
    expect(canView({ kind: "trusted_contact", userId: "recipient-1" }, item, grant)).toBe(false);
    expect(canView({ kind: "author", userId: "other" }, item, null)).toBe(false);
    expect(canView(recipient, item, { ...grant, revoked: true })).toBe(false);
    expect(canView(recipient, item, { ...grant, visibility: "hidden" })).toBe(false);
    expect(canView({ kind: "anonymous" }, item, grant)).toBe(false);
  });
});

describe("check-in", () => {
  it("schedules the next due time from the confirmation timestamp", () => {
    const confirmed = new Date("2026-01-01T00:00:00.000Z");
    expect(nextDueAt(confirmed, 30).toISOString()).toBe("2026-01-31T00:00:00.000Z");
  });

  it("follows the Phase 1 warning sequence and does not treat day 21 as another reminder", () => {
    const dueAt = new Date("2026-01-01T00:00:00.000Z");
    const at = (days: number) => new Date(dueAt.getTime() + days * 24 * 60 * 60 * 1000);
    expect(dueReminderOffsets({ dueAt, now: at(0), sentOffsets: [], pausedUntil: null })).toEqual([0]);
    expect(dueReminderOffsets({ dueAt, now: at(3), sentOffsets: [0], pausedUntil: null })).toEqual([]);
    expect(dueReminderOffsets({ dueAt, now: at(7), sentOffsets: [0], pausedUntil: null })).toEqual([7]);
    expect(dueReminderOffsets({ dueAt, now: at(14), sentOffsets: [0, 7], pausedUntil: null })).toEqual([14]);
    expect(dueReminderOffsets({ dueAt, now: at(21), sentOffsets: [0, 7, 14], pausedUntil: null })).toEqual([]);
    expect(shouldRecordSimulatedRelease({ dueAt, now: at(14), alreadyRecorded: false, pausedUntil: null })).toBe(false);
    expect(shouldRecordSimulatedRelease({ dueAt, now: at(21), alreadyRecorded: false, pausedUntil: null })).toBe(true);
    expect(shouldRecordSimulatedRelease({ dueAt, now: at(21), alreadyRecorded: true, pausedUntil: null })).toBe(false);
    expect(shouldRecordSimulatedRelease({ dueAt, now: at(21), alreadyRecorded: false, pausedUntil: at(40) })).toBe(false);
  });

  it("suppresses reminders during a pause", () => {
    const dueAt = new Date("2026-01-01T00:00:00.000Z");
    const now = new Date("2026-01-10T00:00:00.000Z");
    expect(
      dueReminderOffsets({
        dueAt,
        now,
        sentOffsets: [],
        pausedUntil: new Date("2026-02-01T00:00:00.000Z"),
      }),
    ).toEqual([]);
  });

  it("never returns a content release from a missed check-in", () => {
    expect(actionsForMissedCheckIn()).toEqual(["send_reminder", "send_unreachable_notice", "record_simulated_release"]);
    expect(actionsForMissedCheckIn()).not.toContain("create_content_release");
    expect(missedCheckInCreatesContentJob()).toBe(false);
    expect(verificationReducer("none", { type: "missed_check_in" }).state).toBe("none");
    expect(verificationReducer("collecting", { type: "unreachable_notice" }).state).toBe("collecting");
  });
});

describe("verification", () => {
  it("opens only from an explicit verifier action", () => {
    expect(verificationReducer("none", { type: "verifier_opens_case" }).state).toBe("open");
    expect(() => verificationReducer("open", { type: "verifier_opens_case" })).toThrow(/CASE_ALREADY_OPEN/);
  });

  it("does not enter cooling-off until quorum is met", () => {
    const result = verificationReducer("collecting", {
      type: "attestation_recorded",
      position: "believe_deceased",
      believeCount: 1,
      quorumRequired: 2,
      coolingOffStarted: false,
    });
    expect(result.state).toBe("collecting");
  });

  it("blocks on reached_alive and dispute", () => {
    expect(
      verificationReducer("collecting", {
        type: "attestation_recorded",
        position: "reached_alive",
        believeCount: 0,
        quorumRequired: 2,
        coolingOffStarted: false,
      }).state,
    ).toBe("disputed");
    expect(verificationReducer("cooling_off", { type: "dispute_opened" }).state).toBe("disputed");
  });

  it("recovers from every pre-send state and cancels only pending jobs", () => {
    for (const state of ["open", "collecting", "cooling_off", "cancellation_window", "release_authorized", "disputed"] as const) {
      const result = verificationReducer(state, { type: "author_authenticated", pendingJobIds: ["job-1"] });
      expect(result.state).toBe("recovered");
      expect(result.cancelJobIds).toEqual(["job-1"]);
    }
  });

  it("does not list an already sent job for cancellation", () => {
    const result = verificationReducer("releasing", {
      type: "author_authenticated",
      pendingJobIds: ["pending-only"],
    });
    expect(result.cancelJobIds).toEqual(["pending-only"]);
  });

  it("moves a withdrawal after cooling-off into disputed", () => {
    expect(
      verificationReducer("cooling_off", {
        type: "attestation_withdrawn",
        believeCount: 1,
        quorumRequired: 2,
        coolingOffStarted: true,
      }).state,
    ).toBe("disputed");
  });

  it("follows the waiting periods into release authorization", () => {
    let state = verificationReducer("collecting", {
      type: "attestation_recorded",
      position: "believe_deceased",
      believeCount: 2,
      quorumRequired: 2,
      coolingOffStarted: false,
    }).state;
    expect(state).toBe("cooling_off");
    state = verificationReducer(state, { type: "cooling_off_elapsed" }).state;
    expect(state).toBe("cancellation_window");
    state = verificationReducer(state, { type: "window_elapsed_without_recovery" }).state;
    expect(state).toBe("release_authorized");
  });
});

describe("delivery schedule keys", () => {
  it("keeps one key for a schedule generation and changes it when that generation changes", () => {
    const first = calendarJobKey("item", "person", "2026-07-15T04:00:00.000Z", 1);
    expect(calendarJobKey("item", "person", "2026-07-15T04:00:00.000Z", 1)).toBe(first);
    expect(calendarJobKey("item", "person", "2026-07-15T04:00:00.000Z", 2)).not.toBe(first);
    expect(memoryReadyKey("item", "person", "2026-07-15T04:00:00.000Z", 2)).toBe("memory-ready:item:person:2026-07-15T04:00:00.000Z:g2");
  });
});

describe("check-in notice keys", () => {
  it("keeps the same key for a retry and changes it when the check-in generation changes", () => {
    const first = checkInNoticeKey({ userId: "user-1", cycleId: "cycle-1", generation: 1, kind: "missed_check_in", channel: "email" });
    expect(checkInNoticeKey({ userId: "user-1", cycleId: "cycle-1", generation: 1, kind: "missed_check_in", channel: "email" })).toBe(first);
    expect(checkInNoticeKey({ userId: "user-1", cycleId: "cycle-1", generation: 2, kind: "missed_check_in", channel: "email" })).not.toBe(first);
  });
});

describe("schedule math", () => {
  it("converts an exact New York local time to UTC", () => {
    const instant = exactInstant("2026-01-15", "09:00", "America/New_York");
    expect(instant.toISOString()).toBe("2026-01-15T14:00:00.000Z");
  });

  it("moves a spring-forward gap to the next valid instant", () => {
    const instant = exactInstant("2026-03-08", "02:30", "America/New_York");
    expect(instant.toISOString()).toBe("2026-03-08T07:30:00.000Z");
  });

  it("runs a fall-back overlap once on the first offset", () => {
    const instant = exactInstant("2026-11-01", "01:30", "America/New_York");
    expect(instant.toISOString()).toBe("2026-11-01T05:30:00.000Z");
  });

  it("runs 29 February annually on 28 February in a non-leap year", () => {
    const next = nextAnnualOccurrence(2, 29, "09:00", "UTC", new Date("2026-01-01T00:00:00.000Z"));
    expect(next.toISOString()).toBe("2026-02-28T09:00:00.000Z");
  });

  it("keeps one calendar day across time zones and rejects a non-leap 29 February", () => {
    const plan = calendarDeliveryInstants("2026-06-02", "09:00", [
      { personId: "karachi", timeZone: "Asia/Karachi" },
      { personId: "new-york", timeZone: "America/New_York" },
    ]);
    expect(plan.find((row) => row.personId === "karachi")?.occursAt.toISOString()).toBe("2026-06-02T04:00:00.000Z");
    expect(plan.find((row) => row.personId === "new-york")?.occursAt.toISOString()).toBe("2026-06-02T13:00:00.000Z");
    expect(earliestDelivery(plan.map((row) => row.occursAt)).toISOString()).toBe("2026-06-02T04:00:00.000Z");
    expect(exactInstant("2026-06-02", "02:00", "Asia/Karachi").toISOString()).toBe("2026-06-01T21:00:00.000Z");
    expect(exactInstant("2026-12-31", "09:00", "Asia/Karachi").toISOString()).toBe("2026-12-31T04:00:00.000Z");
    expect(exactInstant("2026-01-31", "09:00", "America/New_York").toISOString()).toBe("2026-01-31T14:00:00.000Z");
    expect(exactInstant("2028-02-29", "09:00", "Asia/Karachi").toISOString()).toBe("2028-02-29T04:00:00.000Z");
    expect(() => exactInstant("2027-02-29", "09:00", "UTC")).toThrow("INVALID_LOCAL_TIME");
  });

  it("places an 18th birthday embargo on the birth date", () => {
    const instant = ageEmbargoInstant("2008-04-12", 18, "09:00", "America/New_York");
    expect(instant.toISOString()).toBe("2026-04-12T13:00:00.000Z");
  });
});
