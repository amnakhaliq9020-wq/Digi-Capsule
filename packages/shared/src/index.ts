export const CHECK_IN_INTERVAL_DAYS = 30;
/** Phase 1 warnings: missed check-in, then 7 days later, then a final warning 7 days after that. */
export const REMINDER_OFFSETS_DAYS = [0, 7, 14] as const;
export const UNREACHABLE_AFTER_DAYS = 21;
/** Seven days after the final warning. Recorded only in test mode and never creates a memory delivery. */
export const SIMULATED_RELEASE_AFTER_DAYS = 21;
export const COOLING_OFF_DAYS = 14;
export const CANCELLATION_WINDOW_HOURS = 72;
export const QUORUM_REQUIRED = 2;
export const LOGIN_MAX_FAILURES = 8;
export const LOGIN_WINDOW_MINUTES = 15;
export const SESSION_TTL_HOURS = 24 * 14;
export const MAX_RELEASE_ATTEMPTS = 5;

export const PHOTO_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
export const VIDEO_MIME_TYPES = ["video/mp4", "video/webm", "video/quicktime"] as const;

export const DEFAULT_MAX_PHOTO_BYTES = 15 * 1024 * 1024;
export const DEFAULT_MAX_VIDEO_BYTES = 100 * 1024 * 1024;

export type ReminderOffset = (typeof REMINDER_OFFSETS_DAYS)[number];

export function warningStageForOffset(offset: number | null): string {
  switch (offset) {
    case 0:
      return "missed_check_in";
    case 7:
      return "second_warning";
    case 14:
      return "final_warning";
    default:
      return "on_time";
  }
}

export function resolveWarningStage(input: {
  overdue: boolean;
  cycleState?: string | null;
  events: { type: string; offsetDays: number | null }[];
}): string {
  if (input.events.some((event) => event.type === "simulated_release_recorded")) {
    return "simulated_conditional_release";
  }
  if (
    input.cycleState === "missed_unreachable" ||
    input.events.some((event) => event.type === "unreachable_notice_sent")
  ) {
    return "unreachable_notice";
  }
  if (!input.overdue) return "on_time";
  const offsets = input.events.map((event) => event.offsetDays).filter((value): value is number => value !== null);
  const highest = offsets.length ? Math.max(...offsets) : null;
  if (highest === null) return "overdue";
  return warningStageForOffset(highest);
}
