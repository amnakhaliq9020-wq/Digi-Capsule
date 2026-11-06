import { createHash } from "node:crypto";
import type { PrismaClient } from "@digi/db";
import { isTestMode } from "../env";
import { isUniqueViolation } from "../errors";

const ALLOWED_VARIABLES = new Set([
  "authorName",
  "stage",
  "code",
  "itemId",
  "personId",
  "summary",
  "text",
]);

export type Notice = {
  to: string;
  templateId: string;
  variables: Record<string, string>;
  idempotencyKey: string;
  relatedType: string;
  relatedId: string;
};

export function renderTemplate(templateId: string, variables: Record<string, string>): string {
  const author = variables.authorName || "The author";
  switch (templateId) {
    case "email_verification":
      return `Confirm your email for Digi Capsule. Code: ${variables.code}. Confirming your email does not send any memories.`;
    case "contact_verification":
      return `Confirm this contact email for Digi Capsule. Code: ${variables.code}.`;
    case "check_in_due":
      return "This is the missed check-in warning. Please confirm you can still sign in to Digi Capsule. Confirming only records that you are reachable. It does not send memories.";
    case "check_in_reminder":
      return variables.stage === "final_warning"
        ? "This is the final warning, 14 days after the missed check-in. Please confirm you can still sign in. In test mode, a simulated conditional release can be recorded 7 days from now. That simulation does not send a memory, and an unanswered check-in is not proof of death."
        : "This is the second warning, 7 days after the missed check-in. Please confirm you can still sign in to Digi Capsule. Confirming does not send memories.";
    case "trusted_contact_unreachable":
      return `We could not confirm ${author} is reachable. This does not mean they have died. You cannot read their memories from this notice.`;
    case "simulated_conditional_release":
      return "This is a simulated conditional release for testing. An unanswered check-in is not proof of death. No memory was sent. Production conditional release stays disabled.";
    case "memory_ready":
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
  prisma: PrismaClient,
  notice: Notice,
): Promise<{ id: string; status: string; providerMessageId: string | null }> {
  const destinationHash = createHash("sha256").update(notice.to.toLowerCase()).digest("hex");
  try {
    const created = await prisma.notificationDelivery.create({
      data: {
        idempotencyKey: notice.idempotencyKey,
        channel: "email",
        templateId: notice.templateId,
        destinationHash,
        status: "queued",
        relatedType: notice.relatedType,
        relatedId: notice.relatedId,
      },
    });
    const variables = safeVariables(notice.templateId, notice.variables);
    const masked = notice.to.replace(/(.{2}).*(@.*)/, "$1***$2");
    console.info(`[notification] template=${notice.templateId} to=${masked}`);
    if (isTestMode()) {
      await prisma.devMessage.create({
        data: { templateId: notice.templateId, destination: notice.to, variables },
      });
    }
    const sent = await prisma.notificationDelivery.update({
      where: { id: created.id },
      data: { status: "sent", providerMessageId: `console:${created.id}` },
    });
    return sent;
  } catch (error) {
    if (!isUniqueViolation(error)) {
      throw error;
    }
    const existing = await prisma.notificationDelivery.findUniqueOrThrow({
      where: { idempotencyKey: notice.idempotencyKey },
    });
    return existing;
  }
}
