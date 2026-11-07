export const TIME_ZONES = ["UTC", "America/New_York", "America/Los_Angeles", "Europe/London", "Asia/Karachi", "Asia/Dubai", "Australia/Sydney"];

export function zonesWith(current: string) {
  return TIME_ZONES.includes(current) ? TIME_ZONES : [current, ...TIME_ZONES];
}

const clockFormat: Intl.DateTimeFormatOptions = {
  day: "numeric",
  month: "long",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
};

/** One readable clock for every screen: "7 November 2026 at 12:13 am". */
export function formatWhen(value: string | Date, timeZone?: string) {
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "Unknown time";
  return new Intl.DateTimeFormat("en-GB", { ...clockFormat, timeZone }).format(date);
}

/** Explain the test clock against the computer clock. Fifteen minutes ignores the drift after the clock is set, because the test clock stays still. */
export function testClockGuidance(testClockIso: string, wallNow = Date.now()) {
  const clock = new Date(testClockIso);
  const shown = formatWhen(clock);
  if (Number.isNaN(clock.getTime())) return "The test clock could not be read.";
  const delta = clock.getTime() - wallNow;
  const slack = 15 * 60 * 1000;
  if (delta > slack) {
    return `Test clock: ${shown}. This is ahead of your computer. A delivery time has to be later than the test clock, so a date on the calendar can still be too early. Set the test clock to now, or pick a later date.`;
  }
  if (delta < -slack) {
    return `Test clock: ${shown}. This clock stays still, so it is now behind your computer. Pick a delivery time later than the test clock, or set it to now.`;
  }
  return `Test clock: ${shown}. This matches your computer. Pick a delivery time later than this.`;
}

export function memoryStatusLabel(status: string) {
  if (status === "scheduled") return "Saved, not sent";
  if (status === "draft") return "Draft";
  if (status === "released") return "Sent";
  if (status === "cancelled") return "Cancelled";
  return status.replaceAll("_", " ");
}

export function deliveryModeLabel(mode: string) {
  if (mode === "on_date") return "On a date";
  if (mode === "if_i_am_gone") return "If I am gone";
  if (mode === "unscheduled") return "No date yet";
  if (mode === "released") return "Sent";
  return mode.replaceAll("_", " ");
}
