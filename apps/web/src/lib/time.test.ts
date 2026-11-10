import { describe, expect, it } from "vitest";
import { deliveryModeLabel, describeLocalChoice, formatWhen, memoryStatusLabel, testClockGuidance, waitingDeliveryNote } from "./time";

describe("formatWhen", () => {
  it("uses a 12-hour clock so midnight matches the computer clock", () => {
    expect(formatWhen("2026-11-06T19:12:59.000Z", "Asia/Karachi")).toBe("7 November 2026 at 12:12 am");
    expect(formatWhen("2027-02-16T10:00:00.000Z", "Asia/Karachi")).toBe("16 February 2027 at 3:00 pm");
    expect(formatWhen("2026-01-15T14:00:00.000Z", "America/New_York")).toBe("15 January 2026 at 9:00 am");
    expect(formatWhen("2026-11-01T05:30:00.000Z", "America/New_York")).toBe("1 November 2026 at 1:30 am");
  });
});

describe("testClockGuidance", () => {
  const wall = Date.parse("2026-11-06T19:13:00.000Z");

  it("says the clock matches when it is within fifteen minutes of the computer", () => {
    const text = testClockGuidance("2026-11-06T19:12:59.000Z", wall);
    expect(text).toContain("7 November 2026 at 12:12 am");
    expect(text).toContain("matches your computer");
    expect(testClockGuidance("2026-11-06T19:00:00.000Z", wall)).toContain("matches your computer");
  });

  it("says the clock is behind only after it has fallen more than fifteen minutes back", () => {
    expect(testClockGuidance("2026-11-06T18:50:00.000Z", wall)).toContain("behind your computer");
  });

  it("says the clock is ahead only when it really is", () => {
    const text = testClockGuidance("2027-02-16T10:00:00.000Z", wall);
    expect(text).toContain("ahead of your computer");
    expect(text).toContain("16 February 2027 at 3:00 pm");
  });
});

describe("waitingDeliveryNote", () => {
  it("keeps a future date unsent and does not send a passed server date from the test clock", () => {
    expect(waitingDeliveryNote(false, true)).toBe("Saved, not sent yet.");
    expect(waitingDeliveryNote(true, true)).toContain("server clock");
    expect(waitingDeliveryNote(true, true)).not.toContain("test clock");
    expect(waitingDeliveryNote(true, false)).toContain("next worker run");
  });
});

describe("describeLocalChoice", () => {
  it("writes the month name and an explicit am or pm without moving the clock", () => {
    expect(describeLocalChoice("2026-11-07", "00:05", "Asia/Karachi")).toBe("7 November 2026 at 12:05 am, in Asia/Karachi.");
    expect(describeLocalChoice("2027-02-16", "15:00", "Asia/Karachi")).toBe("16 February 2027 at 3:00 pm, in Asia/Karachi.");
    expect(describeLocalChoice("", "09:00", "UTC")).toContain("12-hour clock");
  });
});

describe("labels", () => {
  it("uses the same words as the deliveries page", () => {
    expect(memoryStatusLabel("scheduled")).toBe("Saved, not sent");
    expect(deliveryModeLabel("on_date")).toBe("On a date");
  });
});
