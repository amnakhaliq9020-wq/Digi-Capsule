/** Wording for the three check-in warnings. Email is recorded for the author. SMS is recorded as a local mock and is not sent to a phone. */
export const WARNING_MESSAGES = {
  missed_check_in: {
    label: "Missed check-in",
    email:
      "This is the missed check-in warning. Please confirm you can still sign in to Digi Capsule. Confirming only records that you are reachable. It does not send memories.",
    sms: "Digi Capsule: we missed your check-in. Please sign in and press I'm Alive. This does not send memories, and it is not a conclusion that you have died.",
  },
  second_warning: {
    label: "Second warning",
    email:
      "This is the second warning, 7 days after the missed check-in. Please confirm you can still sign in to Digi Capsule. Confirming does not send memories.",
    sms: "Digi Capsule: second warning, 7 days after the missed check-in. Please sign in when you can. This does not send memories.",
  },
  final_warning: {
    label: "Final warning",
    email:
      "This is the final warning, 14 days after the missed check-in. Please confirm you can still sign in. In test mode, a simulated conditional release can be recorded 7 days from now. That simulation does not send a memory, and an unanswered check-in is not proof of death.",
    sms: "Digi Capsule: final warning, 14 days after the missed check-in. Please sign in. An unanswered check-in is not proof of death, and no memory is sent.",
  },
} as const;

export const CHECK_IN_INTERVAL_DAYS = 30;
/** Phase 1 warnings: missed check-in, then 7 days later, then a final warning 7 days after that. */
export const REMINDER_OFFSETS_DAYS = [0, 7, 14] as const;
/** After the missed check-in, the author has this many days to confirm before escalation is recorded. */
export const CONFIRMATION_WINDOW_DAYS = 30;
/** Final email is sent this many days before the confirmation window ends. */
export const CONFIRMATION_FINAL_LEAD_DAYS = 7;
export const CONFIRMATION_WINDOW_FINAL_OFFSET_DAYS = CONFIRMATION_WINDOW_DAYS - CONFIRMATION_FINAL_LEAD_DAYS;
/** Phase 1 offsets, plus the final notice 7 days before the 30-day confirmation window ends. */
export const CHECK_IN_NOTICE_OFFSETS = [...REMINDER_OFFSETS_DAYS, CONFIRMATION_WINDOW_FINAL_OFFSET_DAYS] as const;
export const UNREACHABLE_AFTER_DAYS = 21;
/** Seven days after the final warning. Recorded only in test mode and never creates a memory delivery. */
export const SIMULATED_RELEASE_AFTER_DAYS = 21;
export const COOLING_OFF_DAYS = 14;
export const CANCELLATION_WINDOW_HOURS = 72;
export const QUORUM_REQUIRED = 2;
export const LOGIN_MAX_FAILURES = 8;
export const LOGIN_WINDOW_MINUTES = 15;
export const SESSION_TTL_HOURS = 24 * 14;
export const EMAIL_VERIFICATION_TTL_HOURS = 48;
export const VERIFICATION_EMAIL_MAX = 3;
export const VERIFICATION_EMAIL_WINDOW_MINUTES = 15;
export const PASSWORD_RESET_TTL_MINUTES = 60;
export const PASSWORD_RESET_MAX = 5;
export const SIGNED_URL_TTL_SECONDS = 120;
export const MAX_RELEASE_ATTEMPTS = 5;

export const PHOTO_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
export const VIDEO_MIME_TYPES = ["video/mp4", "video/webm", "video/quicktime"] as const;

export const DEFAULT_MAX_PHOTO_BYTES = 15 * 1024 * 1024;
export const DEFAULT_MAX_VIDEO_BYTES = 100 * 1024 * 1024;
export const DEFAULT_MAX_UPLOADS_PER_USER = 100;
export const DEFAULT_MAX_UPLOAD_BYTES_PER_USER = 1024 * 1024 * 1024;

export type ReminderOffset = (typeof REMINDER_OFFSETS_DAYS)[number];

export function warningStageForOffset(offset: number | null): string {
  switch (offset) {
    case 0:
      return "missed_check_in";
    case 7:
      return "second_warning";
    case 14:
      return "final_warning";
    case CONFIRMATION_WINDOW_FINAL_OFFSET_DAYS:
      return "confirmation_window_final";
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
