import { DateTime } from "luxon";

/** Date-only deliveries use 9:00 a.m. when the sender does not choose another time. */
export const DEFAULT_DELIVERY_LOCAL_TIME = "09:00";

/**
 * The widest real civil-time span, UTC−12 through UTC+14.
 * The worker looks this far ahead so a time-zone change cannot hide a due delivery.
 */
export const DELIVERY_ZONE_LOOKAHEAD_MS = 26 * 60 * 60 * 1000;

export function assertCalendarDate(localDate: string): void {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(localDate);
  if (!match) throw new Error("INVALID_LOCAL_TIME");
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const civil = DateTime.fromObject({ year, month, day }, { zone: "utc" });
  if (!civil.isValid || civil.year !== year || civil.month !== month || civil.day !== day) {
    throw new Error("INVALID_LOCAL_TIME");
  }
}

export function exactInstant(localDate: string, localTime: string, timeZone: string): Date {
  assertCalendarDate(localDate);
  const resolved = resolveLocal(localDate, localTime, timeZone);
  return resolved.toUTC().toJSDate();
}

/** The same calendar day and local time, interpreted in each recipient's time zone. */
export function calendarDeliveryInstants(
  localDate: string,
  localTime: string,
  zones: { personId: string; timeZone: string }[],
): { personId: string; timeZone: string; occursAt: Date }[] {
  const time = localTime || DEFAULT_DELIVERY_LOCAL_TIME;
  return zones.map((zone) => ({
    personId: zone.personId,
    timeZone: zone.timeZone,
    occursAt: exactInstant(localDate, time, zone.timeZone),
  }));
}

export function earliestDelivery(instants: Date[]): Date {
  const first = instants[0];
  if (!first) throw new Error("NO_OCCURRENCE");
  return instants.reduce((soonest, instant) => (instant.getTime() < soonest.getTime() ? instant : soonest));
}

export function assertFutureInstant(instant: Date, now: Date): void {
  if (instant.getTime() <= now.getTime()) {
    throw new Error("DELIVERY_MUST_BE_IN_THE_FUTURE");
  }
}

/**
 * Next annual occurrence strictly after `from`.
 * 29 February runs on 28 February in non-leap years.
 * A local time that falls in a DST gap runs one hour later.
 * A repeated local time runs once, on the first offset.
 */
export function nextAnnualOccurrence(
  month: number,
  day: number,
  localTime: string,
  timeZone: string,
  from: Date,
): Date {
  const [hour, minute] = parseTime(localTime);
  let year = DateTime.fromJSDate(from, { zone: "utc" }).setZone(timeZone).year;
  for (let i = 0; i < 8; i += 1) {
    const civilDay = clampLeapDay(year, month, day);
    const local = resolveParts(year, month, civilDay, hour, minute, timeZone);
    const instant = local.toUTC().toJSDate();
    if (instant.getTime() > from.getTime()) return instant;
    year += 1;
  }
  throw new Error("NO_OCCURRENCE");
}

export function ageEmbargoInstant(
  birthDate: string,
  ageYears: number,
  localTime: string,
  timeZone: string,
): Date {
  const birth = DateTime.fromISO(birthDate, { zone: timeZone });
  if (!birth.isValid) throw new Error("INVALID_BIRTH_DATE");
  const target = birth.plus({ years: ageYears });
  return exactInstant(target.toISODate()!, localTime, timeZone);
}

function resolveLocal(localDate: string, localTime: string, timeZone: string): DateTime {
  const [hour, minute] = parseTime(localTime);
  const date = DateTime.fromISO(localDate, { zone: timeZone });
  if (!date.isValid) throw new Error("INVALID_LOCAL_TIME");
  return resolveParts(date.year, date.month, date.day, hour, minute, timeZone);
}

function resolveParts(year: number, month: number, day: number, hour: number, minute: number, timeZone: string): DateTime {
  const local = DateTime.fromObject({ year, month, day, hour, minute, second: 0 }, { zone: timeZone });
  if (!local.isValid) {
    const shifted = DateTime.fromObject({ year, month, day, hour: hour + 1, minute, second: 0 }, { zone: timeZone });
    if (!shifted.isValid) throw new Error("INVALID_LOCAL_TIME");
    return shifted;
  }
  const earlier = local.minus({ hours: 1 });
  const earlierLocal = earlier.setZone(timeZone);
  if (earlierLocal.hour === hour && earlierLocal.minute === minute && earlier.toMillis() !== local.toMillis()) {
    return earlier;
  }
  return local;
}

function parseTime(localTime: string): [number, number] {
  const match = /^(\d{2}):(\d{2})$/.exec(localTime);
  if (!match) throw new Error("INVALID_LOCAL_TIME");
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) throw new Error("INVALID_LOCAL_TIME");
  return [hour, minute];
}

function clampLeapDay(year: number, month: number, day: number): number {
  if (month === 2 && day === 29 && !DateTime.fromObject({ year, month: 1, day: 1 }).isInLeapYear) return 28;
  return day;
}
