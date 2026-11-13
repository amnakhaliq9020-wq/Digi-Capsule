import { createHash } from "node:crypto";
import { Prisma, type PrismaClient } from "@digi/db";

type Writer = PrismaClient | Prisma.TransactionClient;
import { WARNING_MESSAGES } from "@digi/shared";
import { isTestMode } from "../env";
import { isUniqueViolation } from "../errors";
import {
  ACCEPTED_STATUSES,
  AMBIGUOUS_MAIL_CODES,
  CLOSED_STATUSES,
  PERMANENT_MAIL_CODES,
  attemptBudgetExhausted,
  leaseMs,
  logDelivery,
  retryDelayMs,
} from "./delivery-policy";
import { mailFailure, subjectFor, submitEmail, usesLiveSmtp } from "./mail";
import { smsFailure, submitSms } from "./sms";

const ALLOWED_VARIABLES = new Set([
  "authorName",
  "stage",
  "channel",
  "code",
  "itemId",
  "personId",
  "summary",
  "title",
  "letter",
  "files",
  "text",
  "link",
  "localDeadline",
  "utcDeadline",
  "timeZone",
]);

export type Notice = {
  to: string;
  templateId: string;
  variables: Record<string, string>;
  idempotencyKey: string;
  relatedType: string;
  relatedId: string;
  userId?: string;
  generation?: number;
  scheduledAt?: Date;
  now?: Date;
  workerId?: string;
};

function confirmationInstructions(variables: Record<string, string>): string {
  if (variables.channel === "sms") {
    return variables.link ? ` Confirm: ${variables.link}` : "";
  }
  const deadline = variables.localDeadline
    ? ` Confirm before ${variables.localDeadline} (${variables.timeZone || "UTC"}). The UTC deadline is ${variables.utcDeadline}.`
    : "";
  const link = variables.link
    ? ` Open ${variables.link} and press the confirmation button. The link is single-use and expires. It does not contain your memories.`
    : "";
  return `${deadline}${link} Confirming records that you are reachable. It does not send memories, and a missed check-in is not proof of death.`;
}

export function renderTemplate(templateId: string, variables: Record<string, string>): string {
  const author = variables.authorName || "The author";
  switch (templateId) {
    case "email_verification":
      return `Confirm your email for Digi Capsule. Open ${variables.link} or enter this single-use code: ${variables.code}. It expires. Confirming your email does not send any memories.`;
    case "password_reset":
      return `Reset your Digi Capsule password with this single-use link: ${variables.link}. It expires. If you did not ask for this, ignore it.`;
    case "password_changed":
      return "Your Digi Capsule password was changed. If you did not do this, request a password reset from the sign-in page.";
    case "contact_verification":
      return `Confirm this contact email for Digi Capsule. Code: ${variables.code}.`;
    case "check_in_due":
      return variables.channel === "sms"
        ? WARNING_MESSAGES.missed_check_in.sms
        : `${WARNING_MESSAGES.missed_check_in.email}${confirmationInstructions(variables)}`;
    case "check_in_reminder":
      if (variables.channel === "sms") {
        return variables.stage === "final_warning" ? WARNING_MESSAGES.final_warning.sms : WARNING_MESSAGES.second_warning.sms;
      }
      return `${variables.stage === "final_warning" ? WARNING_MESSAGES.final_warning.email : WARNING_MESSAGES.second_warning.email}${confirmationInstructions(variables)}`;
    case "check_in_window_final":
      return `This is the final warning before your confirmation window ends.${confirmationInstructions(variables)}`;
    case "check_in_escalation":
      return `${author}, the confirmation window ended without a check-in. Digi Capsule recorded an escalation for review. This is not a finding of death, and no memory was released.`;
    case "trusted_contact_unreachable":
      return `We could not confirm ${author} is reachable. This does not mean they have died. You cannot read their memories from this notice.`;
    case "simulated_conditional_release":
      return "This is a simulated conditional release for testing. An unanswered check-in is not proof of death. No memory was sent. Production conditional release stays disabled.";
    case "memory_ready":
      if (variables.letter) {
        return `${author} shared "${variables.title || "a memory"}" with you on Digi Capsule. Letter: ${variables.letter}. Files: ${variables.files || "none"}. This test copy was stored locally and was not sent by an outside provider.`;
      }
      return `${author} shared a memory with you on Digi Capsule. ${variables.summary || "Sign in when a portal is available."} This message does not include the memory itself.`;
    case "review_recovered":
      return `${author} confirmed they are reachable. The release review has stopped. Nothing further will be sent from that review.`;
    default:
      return "Digi Capsule notification.";
  }
}

function safeVariables(templateId: string, variables: Record<string, string>): Record<string, string> {
  const text = renderTemplate(templateId, variables);
  const safe: Record<string, string> = { text };
  for (const [key, value] of Object.entries(variables)) {
    if (ALLOWED_VARIABLES.has(key) && key !== "text") safe[key] = value;
  }
  return safe;
}

export async function deliverEmail(
  prisma: Writer,
  notice: Notice & { channel?: "email" | "sms" },
): Promise<{ id: string; status: string; providerMessageId: string | null; replayed: boolean }> {
  const channel = notice.channel ?? "email";
  const now = notice.now ?? notice.scheduledAt ?? new Date();
  const workerId = notice.workerId || `worker:${process.pid}`;
  const destinationHash = createHash("sha256").update(notice.to.toLowerCase()).digest("hex");
  const replay = (row: { id: string; status: string; providerMessageId: string | null }) => {
    logDelivery({
      event: "replay",
      notificationId: row.id,
      idempotencyKey: notice.idempotencyKey,
      template: notice.templateId,
      relatedId: notice.relatedId,
      status: row.status,
      providerMessageId: row.providerMessageId,
      workerId,
    });
    return { id: row.id, status: row.status, providerMessageId: row.providerMessageId, replayed: true };
  };
  const existing = await prisma.notificationDelivery.findUnique({ where: { idempotencyKey: notice.idempotencyKey } });
  if (existing && (CLOSED_STATUSES.has(existing.status) || ACCEPTED_STATUSES.has(existing.status))) return replay(existing);
  let row = existing;
  if (!row) {
    try {
      row = await prisma.notificationDelivery.create({
        data: {
          idempotencyKey: notice.idempotencyKey,
          channel,
          templateId: notice.templateId,
          destinationHash,
          status: "pending",
          relatedType: notice.relatedType,
          relatedId: notice.relatedId,
          userId: notice.userId,
          generationId: notice.generation,
          scheduledAt: notice.scheduledAt ?? now,
        },
      });
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      const raced = await prisma.notificationDelivery.findUniqueOrThrow({ where: { idempotencyKey: notice.idempotencyKey } });
      if (CLOSED_STATUSES.has(raced.status) || ACCEPTED_STATUSES.has(raced.status)) return replay(raced);
      row = raced;
    }
  }
  if (row.status === "failed" && (!row.retryable || (row.nextAttemptAt && row.nextAttemptAt.getTime() > now.getTime()))) {
    return replay(row);
  }
  if (row.status === "processing") {
    const stale = !row.claimedAt || now.getTime() - row.claimedAt.getTime() >= leaseMs();
    if (!stale || row.dispatchStartedAt) return replay(row);
  }
  if (attemptBudgetExhausted(row.attemptCount) && row.status !== "pending" && row.status !== "queued") {
    const stopped = await prisma.notificationDelivery.update({
      where: { id: row.id },
      data: { status: "bounced", retryable: false, errorCode: row.errorCode || "attempt_budget", nextAttemptAt: null },
    });
    return replay(stopped);
  }
  const claimable = row.status === "processing" ? ["processing"] : ["pending", "queued", "failed"];
  const claimed = await prisma.notificationDelivery.updateMany({
    where: {
      id: row.id,
      status: { in: claimable as ("pending" | "queued" | "failed" | "processing")[] },
      ...(row.status === "failed" ? { retryable: true } : {}),
    },
    data: {
      status: "processing",
      attemptCount: { increment: 1 },
      claimedAt: now,
      workerId,
      errorCode: null,
      nextAttemptAt: null,
    },
  });
  if (claimed.count !== 1) {
    const current = await prisma.notificationDelivery.findUniqueOrThrow({ where: { id: row.id } });
    return replay(current);
  }
  row = await prisma.notificationDelivery.findUniqueOrThrow({ where: { id: row.id } });
  if (notice.userId && notice.generation !== undefined) {
    await prisma.$executeRaw`SELECT user_id FROM check_in_policies WHERE user_id = ${notice.userId}::uuid FOR UPDATE`;
    const policy = await prisma.checkInPolicy.findUnique({ where: { userId: notice.userId } });
    if (!policy || policy.warningGeneration !== notice.generation) {
      const cancelled = await prisma.notificationDelivery.update({
        where: { id: row.id },
        data: { status: "cancelled", cancelledAt: now, errorCode: "workflow_reset", workerId, payload: Prisma.DbNull },
      });
      logDelivery({
        event: "cancelled",
        notificationId: cancelled.id,
        idempotencyKey: notice.idempotencyKey,
        template: notice.templateId,
        status: "cancelled",
        error: "workflow_reset",
        attempt: row.attemptCount,
        workerId,
      });
      return { id: cancelled.id, status: cancelled.status, providerMessageId: null, replayed: false };
    }
  }
  const armed = await prisma.notificationDelivery.updateMany({
    where: { id: row.id, status: "processing" },
    data: { dispatchStartedAt: now, workerId },
  });
  if (armed.count !== 1) {
    const current = await prisma.notificationDelivery.findUniqueOrThrow({ where: { id: row.id } });
    return replay(current);
  }
  if (notice.userId && notice.generation !== undefined) {
    const policy = await prisma.checkInPolicy.findUnique({ where: { userId: notice.userId } });
    if (!policy || policy.warningGeneration !== notice.generation) {
      await prisma.notificationDelivery.updateMany({
        where: { id: row.id, status: "processing" },
        data: { status: "cancelled", cancelledAt: now, errorCode: "workflow_reset", workerId, payload: Prisma.DbNull },
      });
      return { id: row.id, status: "cancelled", providerMessageId: null, replayed: false };
    }
  }
  logDelivery({
    event: "dispatch",
    notificationId: row.id,
    idempotencyKey: notice.idempotencyKey,
    template: notice.templateId,
    relatedType: notice.relatedType,
    relatedId: notice.relatedId,
    attempt: row.attemptCount,
    workerId,
    channel,
  });
  const forcedFailure = channel === "sms" ? process.env.DIGI_SMS_FAIL === "true" : process.env.DIGI_EMAIL_FAIL === "true";
  if (forcedFailure) return recordFailure(prisma, row.id, notice, "provider_unavailable", false, now, workerId, row.attemptCount);
  const variables = safeVariables(notice.templateId, notice.variables);
  const simulateSmtp = channel === "email" && Boolean(process.env.DIGI_SMTP_RESULT);
  if (channel === "email" && (usesLiveSmtp() || simulateSmtp)) {
    try {
      const submitted = await submitEmail({
        to: notice.to,
        subject: subjectFor(notice.templateId),
        text: variables.text || "Digi Capsule notification.",
        idempotencyKey: notice.idempotencyKey,
      });
      return recordAcceptance(prisma, row.id, notice, submitted.messageId || `smtp:${row.id}`, "smtp_accepted", now, workerId, row.attemptCount);
    } catch (error) {
      const failure = mailFailure(error);
      return recordFailure(prisma, row.id, notice, failure.code, AMBIGUOUS_MAIL_CODES.has(failure.code), now, workerId, row.attemptCount);
    }
  }
  if (channel === "sms" && !notice.to.startsWith("sms-mock:") && process.env.NODE_ENV !== "test") {
    try {
      const submitted = await submitSms({ to: notice.to, body: variables.text || "Digi Capsule check-in." });
      return recordAcceptance(prisma, row.id, notice, submitted.messageId, "sms_accepted", now, workerId, row.attemptCount);
    } catch (error) {
      const failure = smsFailure(error);
      const permanent = failure.code === "SMS_INVALID_NUMBER";
      return recordFailure(prisma, row.id, notice, failure.code, failure.code === "SMS_TIMEOUT", now, workerId, row.attemptCount, permanent);
    }
  }
  if (isTestMode()) {
    await prisma.devMessage.create({
      data: { templateId: notice.templateId, destination: notice.to, variables },
    });
  }
  return recordAcceptance(prisma, row.id, notice, `console:${row.id}`, "console_accepted", now, workerId, row.attemptCount);
}

async function recordAcceptance(
  prisma: Writer,
  id: string,
  notice: Notice,
  providerMessageId: string,
  providerResponse: string,
  now: Date,
  workerId: string,
  attempt: number,
) {
  const sent = await prisma.notificationDelivery.update({
    where: { id },
    data: {
      status: "sent",
      sentAt: now,
      providerMessageId,
      providerResponse,
      errorCode: null,
      nextAttemptAt: null,
      workerId,
      payload: Prisma.DbNull,
    },
  });
  logDelivery({
    event: "accepted",
    notificationId: sent.id,
    idempotencyKey: notice.idempotencyKey,
    template: notice.templateId,
    relatedId: notice.relatedId,
    attempt,
    workerId,
    providerMessageId,
    status: "sent",
    note: "provider_accepted_not_inbox_delivery",
  });
  return { id: sent.id, status: sent.status, providerMessageId: sent.providerMessageId, replayed: false };
}

async function recordFailure(
  prisma: Writer,
  id: string,
  notice: Notice,
  code: string,
  ambiguous: boolean,
  now: Date,
  workerId: string,
  attempt: number,
  permanent = PERMANENT_MAIL_CODES.has(code),
) {
  const exhausted = attemptBudgetExhausted(attempt);
  const status = ambiguous ? "uncertain" : permanent || exhausted ? "bounced" : "failed";
  const failed = await prisma.notificationDelivery.update({
    where: { id },
    data: {
      status,
      errorCode: code,
      providerResponse: ambiguous ? "timeout_after_possible_acceptance" : code,
      retryable: status === "failed",
      nextAttemptAt: status === "failed" ? new Date(now.getTime() + retryDelayMs(attempt)) : null,
      workerId,
      ...(status === "failed" ? {} : { payload: Prisma.DbNull }),
    },
  });
  logDelivery({
    event: ambiguous ? "uncertain" : "failed",
    notificationId: failed.id,
    idempotencyKey: notice.idempotencyKey,
    template: notice.templateId,
    relatedId: notice.relatedId,
    attempt,
    workerId,
    status,
    error: code,
  });
  return { id: failed.id, status: failed.status, providerMessageId: null, replayed: false };
}

/** Writes the outbox row only. The provider is contacted later by dispatchNotice. */
export async function enqueueNotice(prisma: Writer, notice: Notice & { channel?: "email" | "sms" }) {
  const existing = await prisma.notificationDelivery.findUnique({ where: { idempotencyKey: notice.idempotencyKey } });
  if (existing) return { id: existing.id, status: existing.status, created: false };
  const destinationHash = createHash("sha256").update(notice.to.toLowerCase()).digest("hex");
  try {
    const row = await prisma.notificationDelivery.create({
      data: {
        idempotencyKey: notice.idempotencyKey,
        channel: notice.channel ?? "email",
        templateId: notice.templateId,
        destinationHash,
        status: "pending",
        relatedType: notice.relatedType,
        relatedId: notice.relatedId,
        userId: notice.userId,
        generationId: notice.generation,
        scheduledAt: notice.scheduledAt ?? notice.now ?? new Date(),
        payload: { ...notice.variables, to: notice.to },
      },
    });
    return { id: row.id, status: row.status, created: true };
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    const raced = await prisma.notificationDelivery.findUniqueOrThrow({ where: { idempotencyKey: notice.idempotencyKey } });
    return { id: raced.id, status: raced.status, created: false };
  }
}

function payloadVariables(value: Prisma.JsonValue | null): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const variables: Record<string, string> = {};
  for (const [key, item] of Object.entries(value)) {
    if (typeof item === "string") variables[key] = item;
  }
  return variables;
}

/** Sends one committed outbox row. A second call reuses the same idempotency key. */
export async function dispatchNotice(prisma: PrismaClient, id: string, now: Date, workerId: string) {
  const row = await prisma.notificationDelivery.findUnique({ where: { id } });
  if (!row) return { id, status: "missing", providerMessageId: null, replayed: true };
  if (row.status === "cancelled" || row.status === "sent" || row.status === "delivered" || row.status === "uncertain" || row.status === "bounced") {
    return { id: row.id, status: row.status, providerMessageId: row.providerMessageId, replayed: true };
  }
  const stored = payloadVariables(row.payload);
  const to = stored.to || "";
  delete stored.to;
  return deliverEmail(prisma, {
    to,
    templateId: row.templateId,
    variables: stored,
    idempotencyKey: row.idempotencyKey,
    relatedType: row.relatedType,
    relatedId: row.relatedId,
    userId: row.userId ?? undefined,
    generation: row.generationId ?? undefined,
    scheduledAt: row.scheduledAt ?? now,
    now,
    workerId,
    channel: row.channel,
  });
}
