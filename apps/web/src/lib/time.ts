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

/** A date is compared with the server clock. Test mode does not move that comparison onto the simulated clock. */
export function waitingDeliveryNote(due: boolean, testMode: boolean): string {
  if (!due) return "Saved, not sent yet.";
  if (testMode) {
    return "This time has passed on the server clock. The automatic worker sends it on its next run. The test console uses a separate clock and does not send this by itself.";
  }
  return "This time has passed. It sends on the next worker run.";
}

export function memoryStatusLabel(status: string) {
  if (status === "scheduled") return "Saved, not sent";
  if (status === "draft") return "Draft";
  if (status === "released") return "Sent";
  if (status === "cancelled") return "Cancelled";
  return status.replaceAll("_", " ");
}

const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** The calendar day the sender picked, read from the date parts so it cannot shift across midnight UTC. */
export function civilDateLabel(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  if (!year || !month || !day || month < 1 || month > 12 || day < 1 || day > 31) return "Choose a date";
  return `${day} ${months[month - 1]} ${year}`;
}

/** The clock time the sender picked, written with am or pm and without a Date object. */
export function civilTimeLabel(time: string) {
  const [hour = 0, minute = 0] = time.split(":").map(Number);
  if (hour > 23 || minute > 59) return time;
  const hour12 = ((hour + 11) % 12) + 1;
  const suffix = hour < 12 ? "am" : "pm";
  return `${hour12}:${String(minute).padStart(2, "0")} ${suffix}`;
}

/** Show a chosen calendar date with the month name and an explicit am/pm, without shifting the clock. */
export function describeLocalChoice(date: string, time: string, timeZone: string) {
  if (!date) return `Choose a date. Times use a 12-hour clock in ${timeZone}.`;
  const [year, month, day] = date.split("-").map(Number);
  const [hour = 0, minute = 0] = time.split(":").map(Number);
  if (!year || !month || !day || month < 1 || month > 12) return `Choose a date. Times use a 12-hour clock in ${timeZone}.`;
  const hour12 = ((hour + 11) % 12) + 1;
  const suffix = hour < 12 ? "am" : "pm";
  const minutes = String(minute).padStart(2, "0");
  return `${day} ${months[month - 1]} ${year} at ${hour12}:${minutes} ${suffix}, in ${timeZone}.`;
}

export function deliveryModeLabel(mode: string) {
  if (mode === "on_date") return "On a date";
  if (mode === "if_i_am_gone") return "If I am gone";
  if (mode === "unscheduled") return "No date yet";
  if (mode === "released") return "Sent";
  return mode.replaceAll("_", " ");
}
