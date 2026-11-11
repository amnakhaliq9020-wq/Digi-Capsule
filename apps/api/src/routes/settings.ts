import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { isAdministrator, requireUser } from "../auth";
import { AppError } from "../errors";
import { OFFICIAL_FROM, mailFailure, submitEmail, usesLiveSmtp, verifySmtpLogin } from "../lib/mail";
import { renderTemplate } from "../lib/notify";
import { isE164, smsConfigured, smsFailure, submitSms } from "../lib/sms";
import { markSmtpSend, markSmtpVerified, readSmtpSettings, saveSmtpSettings } from "../services/smtp-settings";

async function requireAdministrator(request: Parameters<typeof requireUser>[0]) {
  const user = await requireUser(request);
  if (!isAdministrator(user.email)) throw new AppError(403, "FORBIDDEN", "Only an administrator can manage email delivery.");
  return user;
}

export async function settingsRoutes(app: FastifyInstance) {
  app.get("/settings/smtp", async (request) => {
    await requireAdministrator(request);
    return readSmtpSettings(app.prisma);
  });

  app.put(
    "/settings/smtp",
    { config: { rateLimit: { max: 10, timeWindow: "15 minutes" } } },
    async (request) => {
      await requireAdministrator(request);
      const parsed = z.object({
        host: z.string().trim().min(1).max(200),
        port: z.number().int().positive().max(65535),
        username: z.string().trim().min(1).max(200),
        password: z.string().min(1).max(200).optional(),
        encryption: z.enum(["starttls", "ssl"]),
      }).safeParse(request.body);
      if (!parsed.success) throw new AppError(400, "VALIDATION_ERROR", "Check the SMTP host, port, username, and encryption.");
      try {
        await saveSmtpSettings(app.prisma, parsed.data);
      } catch (error) {
        if (error && typeof error === "object" && "code" in error && error.code === "PASSWORD_REQUIRED") {
          throw new AppError(400, "PASSWORD_REQUIRED", "Enter the SMTP password.");
        }
        throw error;
      }
      if (process.env.NODE_ENV === "test") return readSmtpSettings(app.prisma);
      const verified = await verifySmtpLogin();
      return markSmtpVerified(app.prisma, verified);
    },
  );

  app.post(
    "/settings/test-email",
    { config: { rateLimit: { max: 5, timeWindow: "15 minutes" } } },
    async (request) => {
      await requireAdministrator(request);
      const parsed = z.object({
        to: z.string().trim().email().max(200),
        confirm: z.literal(true),
      }).safeParse(request.body);
      if (!parsed.success) throw new AppError(400, "RECIPIENT_REQUIRED", "Enter the email address that should receive the test.");
      const to = parsed.data.to.toLowerCase();
      if (process.env.NODE_ENV !== "test" && !usesLiveSmtp()) {
        throw new AppError(503, "EMAIL_NOT_CONFIGURED", "Email delivery is not configured on this server.");
      }
      try {
        await submitEmail({
          to,
          subject: "Digi Capsule Email Configuration",
          text: `This is a Digi Capsule configuration test for ${to}. It was sent from ${OFFICIAL_FROM}. It does not contain account secrets, and it does not send a memory.`,
        });
        await markSmtpSend(app.prisma, { ok: true });
      } catch (error) {
        const failure = mailFailure(error);
        await markSmtpSend(app.prisma, { ok: false, code: failure.code });
        throw new AppError(502, failure.code, failure.message);
      }
      return {
        accepted: true,
        from: OFFICIAL_FROM,
        recipient: to,
        message: `The mail server accepted the message for ${to}.`,
      };
    },
  );

  app.post(
    "/settings/test-sms",
    { config: { rateLimit: { max: 3, timeWindow: "15 minutes" } } },
    async (request) => {
      const user = await requireUser(request);
      const parsed = z.object({ to: z.string().trim().max(20), confirm: z.literal(true) }).safeParse(request.body);
      if (!parsed.success) throw new AppError(400, "CONFIRM_REQUIRED", "Confirm the phone number and that this sends one real SMS.");
      if (!isE164(parsed.data.to)) throw new AppError(400, "SMS_INVALID_NUMBER", "Enter a phone number in international format, starting with +.");
      const allowed = envSmsTestNumber();
      if (!allowed || parsed.data.to !== allowed) {
        throw new AppError(403, "RECIPIENT_NOT_ALLOWED", "SMS tests can go only to the opted-in number configured on the server.");
      }
      if (!smsConfigured()) {
        throw new AppError(503, "SMS_NOT_CONFIGURED", "SMS is not configured. Set the Twilio account, token, and sender on the server. No message was sent.");
      }
      const text = renderTemplate("check_in_due", {
        channel: "sms",
        authorName: user.displayName,
        link: `${process.env.WEB_ORIGIN || "http://localhost:3000"}/check-in`,
      });
      try {
        const submitted = await submitSms({ to: parsed.data.to, body: text });
        await app.prisma.notificationDelivery.create({
          data: {
            userId: user.id,
            idempotencyKey: `sms-test:${user.id}:${Date.now()}`,
            channel: "sms",
            templateId: "check_in_due",
            destinationHash: "sms-test",
            status: "sent",
            sentAt: new Date(),
            relatedType: "sms_test",
            relatedId: user.id,
            providerMessageId: submitted.messageId,
          },
        });
        return { accepted: true, message: "The SMS provider accepted the test warning. Acceptance does not yet prove the phone has received it." };
      } catch (error) {
        const failure = smsFailure(error);
        throw new AppError(502, failure.code, failure.message);
      }
    },
  );

  app.get("/settings/notifications", async (request) => {
    const user = await requireUser(request);
    const rows = await app.prisma.notificationDelivery.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 30,
      select: {
        id: true,
        channel: true,
        templateId: true,
        status: true,
        errorCode: true,
        providerMessageId: true,
        scheduledAt: true,
        sentAt: true,
        cancelledAt: true,
        generationId: true,
        attemptCount: true,
        createdAt: true,
      },
    });
    return { notifications: rows };
  });

  app.post("/settings/sms-opt-out", async (request) => {
    const user = await requireUser(request);
    const now = new Date();
    await app.prisma.profile.update({ where: { userId: user.id }, data: { checkInChannelSms: false } });
    await app.prisma.consentRecord.updateMany({
      where: { userId: user.id, purpose: "sms_check_in", revokedAt: null },
      data: { revokedAt: now },
    });
    return { message: "SMS check-in warnings are off for this account." };
  });
}

function envSmsTestNumber(): string {
  return (process.env.SMS_TEST_NUMBER || "").trim();
}
