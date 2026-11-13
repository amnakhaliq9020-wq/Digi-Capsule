import { MAX_RELEASE_ATTEMPTS } from "@digi/shared";
import { opsLog } from "./ops-log";

/** Provider accepted the message. This is not proof it reached an inbox. */
export const ACCEPTED_STATUSES = new Set(["sent", "delivered"]);

/** Do not contact the provider again for these rows. */
export const CLOSED_STATUSES = new Set(["sent", "delivered", "cancelled", "bounced", "uncertain", "dead"]);

export const PERMANENT_MAIL_CODES = new Set(["SMTP_REJECTED", "RECIPIENT_REQUIRED", "SMTP_SENDER_REJECTED"]);

export const AMBIGUOUS_MAIL_CODES = new Set(["SMTP_TIMEOUT"]);

export function retryDelayMs(attempt: number): number {
  const step = Math.max(0, Math.min(attempt - 1, 6));
  return Math.min(2 ** step, 60) * 60_000;
}

export function attemptBudgetExhausted(attemptCount: number): boolean {
  return attemptCount >= MAX_RELEASE_ATTEMPTS;
}

export function leaseMs(): number {
  const configured = Number(process.env.DIGI_DELIVERY_LEASE_MS ?? 120_000);
  return Number.isFinite(configured) && configured >= 0 ? configured : 120_000;
}

/** Identifiers only. Never pass message bodies, tokens, passwords, or file URLs. */
export function logDelivery(fields: Record<string, string | number | boolean | null | undefined>): void {
  const safe: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined || value === null || value === "") continue;
    if (/password|token|secret|letter|body|cookie/i.test(key)) continue;
    safe[key] = typeof value === "string" ? value.replace(/\s+/g, " ") : value;
  }
  opsLog("info", "delivery", safe);
}
