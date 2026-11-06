import { REMINDER_OFFSETS_DAYS, SIMULATED_RELEASE_AFTER_DAYS, UNREACHABLE_AFTER_DAYS } from "@digi/shared";

const DAY_MS = 24 * 60 * 60 * 1000;

export type CheckInCycleState = "due" | "reminded" | "confirmed" | "missed_unreachable" | "cancelled";

export type MissedCheckInAction = "send_reminder" | "send_unreachable_notice" | "record_simulated_release";

export function nextDueAt(confirmedAt: Date, intervalDays: number): Date {
  return new Date(confirmedAt.getTime() + intervalDays * DAY_MS);
}

export function daysOverdue(dueAt: Date, now: Date): number {
  const delta = now.getTime() - dueAt.getTime();
  if (delta < 0) return 0;
  return Math.floor(delta / DAY_MS);
}

/**
 * Reminders that should be sent now. A missed check-in never authorizes a memory release.
 * The returned list deliberately has no content-release action.
 */
export function dueReminderOffsets(input: {
  dueAt: Date;
  now: Date;
  sentOffsets: number[];
  pausedUntil: Date | null;
  offsets?: readonly number[];
}): number[] {
  if (input.pausedUntil && input.pausedUntil.getTime() > input.now.getTime()) return [];
  const offsets = input.offsets ?? REMINDER_OFFSETS_DAYS;
  const sent = new Set(input.sentOffsets);
  return offsets.filter((offset) => {
    if (sent.has(offset)) return false;
    return input.now.getTime() >= input.dueAt.getTime() + offset * DAY_MS;
  });
}

export function shouldNotifyTrustedContacts(input: {
  dueAt: Date;
  now: Date;
  alreadySent: boolean;
  pausedUntil: Date | null;
}): boolean {
  if (input.alreadySent) return false;
  if (input.pausedUntil && input.pausedUntil.getTime() > input.now.getTime()) return false;
  return input.now.getTime() >= input.dueAt.getTime() + UNREACHABLE_AFTER_DAYS * DAY_MS;
}

/** Due only after the final warning plus 7 days. Recording it must not create a content job. */
export function shouldRecordSimulatedRelease(input: {
  dueAt: Date;
  now: Date;
  alreadyRecorded: boolean;
  pausedUntil: Date | null;
}): boolean {
  if (input.alreadyRecorded) return false;
  if (input.pausedUntil && input.pausedUntil.getTime() > input.now.getTime()) return false;
  return input.now.getTime() >= input.dueAt.getTime() + SIMULATED_RELEASE_AFTER_DAYS * DAY_MS;
}

export function actionsForMissedCheckIn(): readonly MissedCheckInAction[] {
  return ["send_reminder", "send_unreachable_notice", "record_simulated_release"];
}
