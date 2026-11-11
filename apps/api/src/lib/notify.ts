import { createHash } from "node:crypto";
import type { Prisma, PrismaClient } from "@digi/db";

type Writer = PrismaClient | Prisma.TransactionClient;
import { WARNING_MESSAGES } from "@digi/shared";
import { isTestMode } from "../env";
import { isUniqueViolation } from "../errors";
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
  const destinationHash = createHash("sha256").update(notice.to.toLowerCase()).digest("hex");
  const existing = await prisma.notificationDelivery.findUnique({ where: { idempotencyKey: notice.idempotencyKey } });
  if (existing && existing.status !== "failed") {
    return { id: existing.id, status: existing.status, providerMessageId: existing.providerMessageId, replayed: true };
  }
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
          scheduledAt: notice.scheduledAt ?? new Date(),
        },
      });
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      const raced = await prisma.notificationDelivery.findUniqueOrThrow({ where: { idempotencyKey: notice.idempotencyKey } });
      if (raced.status !== "failed") {
        return { id: raced.id, status: raced.status, providerMessageId: raced.providerMessageId, replayed: true };
      }
      row = raced;
    }
  }
  if (row.status === "failed") {
    const claimed = await prisma.notificationDelivery.updateMany({
      where: { id: row.id, status: "failed" },
      data: { status: "queued", errorCode: null },
    });
    if (claimed.count !== 1) {
      const current = await prisma.notificationDelivery.findUniqueOrThrow({ where: { id: row.id } });
      return { id: current.id, status: current.status, providerMessageId: current.providerMessageId, replayed: true };
    }
  }
  if (notice.userId && notice.generation !== undefined) {
    await prisma.$executeRaw`SELECT user_id FROM check_in_policies WHERE user_id = ${notice.userId}::uuid FOR UPDATE`;
    const policy = await prisma.checkInPolicy.findUnique({ where: { userId: notice.userId } });
    if (!policy || policy.warningGeneration !== notice.generation) {
      const cancelled = await prisma.notificationDelivery.update({
        where: { id: row.id },
        data: { status: "cancelled", cancelledAt: new Date(), errorCode: "workflow_reset" },
      });
      return { id: cancelled.id, status: cancelled.status, providerMessageId: null, replayed: false };
    }
  }
  await prisma.notificationDelivery.update({
    where: { id: row.id },
    data: { status: "processing", attemptCount: { increment: 1 } },
  });
  const forcedFailure = channel === "sms" ? process.env.DIGI_SMS_FAIL === "true" : process.env.DIGI_EMAIL_FAIL === "true";
  if (forcedFailure) {
    const failed = await prisma.notificationDelivery.update({
      where: { id: row.id },
      data: { status: "failed", errorCode: "provider_unavailable" },
    });
    console.error(`[notification] delivery failed template=${notice.templateId}`);
    return { id: failed.id, status: failed.status, providerMessageId: null, replayed: false };
  }
  const variables = safeVariables(notice.templateId, notice.variables);
  const masked = notice.to.replace(/(.{2}).*(@.*)/, "$1***$2");
  console.info(`[notification] template=${notice.templateId} to=${masked}`);
  if (channel === "email" && usesLiveSmtp()) {
    try {
      const submitted = await submitEmail({
        to: notice.to,
        subject: subjectFor(notice.templateId),
        text: variables.text || "Digi Capsule notification.",
      });
      const sent = await prisma.notificationDelivery.update({
        where: { id: row.id },
        data: { status: "sent", sentAt: new Date(), providerMessageId: submitted.messageId || `smtp:${row.id}`, errorCode: null },
      });
      return { id: sent.id, status: sent.status, providerMessageId: sent.providerMessageId, replayed: false };
    } catch (error) {
      const failure = mailFailure(error);
      const failed = await prisma.notificationDelivery.update({
        where: { id: row.id },
        data: { status: "failed", errorCode: failure.code },
      });
      console.error(`[notification] delivery failed template=${notice.templateId} code=${failure.code}`);
      return { id: failed.id, status: failed.status, providerMessageId: null, replayed: false };
    }
  }
  if (channel === "sms" && !notice.to.startsWith("sms-mock:") && process.env.NODE_ENV !== "test") {
    try {
      const submitted = await submitSms({ to: notice.to, body: variables.text || "Digi Capsule check-in." });
      const sent = await prisma.notificationDelivery.update({
        where: { id: row.id },
        data: { status: "sent", sentAt: new Date(), providerMessageId: submitted.messageId, errorCode: null },
      });
      return { id: sent.id, status: sent.status, providerMessageId: sent.providerMessageId, replayed: false };
    } catch (error) {
      const failure = smsFailure(error);
      const failed = await prisma.notificationDelivery.update({
        where: { id: row.id },
        data: { status: "failed", errorCode: failure.code },
      });
      console.error(`[notification] delivery failed template=${notice.templateId} code=${failure.code}`);
      return { id: failed.id, status: failed.status, providerMessageId: null, replayed: false };
    }
  }
  if (isTestMode()) {
    await prisma.devMessage.create({
      data: { templateId: notice.templateId, destination: notice.to, variables },
    });
  }
  const sent = await prisma.notificationDelivery.update({
    where: { id: row.id },
    data: { status: "sent", sentAt: new Date(), providerMessageId: `console:${row.id}`, errorCode: null },
  });
  return { id: sent.id, status: sent.status, providerMessageId: sent.providerMessageId, replayed: false };
}
