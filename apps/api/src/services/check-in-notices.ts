import type { PrismaClient } from "@digi/db";
import { reminderKey } from "@digi/domain";
import {
  CHECK_IN_NOTICE_OFFSETS,
  CONFIRMATION_WINDOW_DAYS,
  CONFIRMATION_WINDOW_FINAL_OFFSET_DAYS,
} from "@digi/shared";
import { dueReminderOffsets } from "@digi/domain";
import { env, isTestMode } from "../env";
import { randomToken, sha256 } from "../lib/crypto";
import { audit } from "../lib/audit";
import { deliverEmail } from "../lib/notify";
import { maySendLiveSms } from "../lib/sms";

const DAY_MS = 24 * 60 * 60 * 1000;

function formatZoned(date: Date, timeZone: string): string {
  const zone = timeZone || "UTC";
  try {
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: zone,
      day: "numeric",
      month: "long",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).format(date);
  } catch {
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: "UTC",
      day: "numeric",
      month: "long",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).format(date);
  }
}

/**
 * Sends the due check-in emails for one cycle and records escalation when the
 * confirmation window has ended. A missed check-in does not release a memory.
 * The cycle row lock keeps two workers from sending the same account twice.
 */
export async function sendDueCheckInNotices(prisma: PrismaClient, cycleId: string, now: Date) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${cycleId})::bigint)`;
    const cycle = await tx.checkInCycle.findUnique({
      where: { id: cycleId },
      include: { events: true, user: { include: { profile: true, checkInPolicy: true } } },
    });
    const policy = cycle?.user.checkInPolicy;
    if (!cycle || !policy || !cycle.user.email) return { remindersSent: 0, confirmationEscalations: 0 };
    if (!["due", "reminded", "missed_unreachable"].includes(cycle.state)) {
      return { remindersSent: 0, confirmationEscalations: 0 };
    }
    const paused = policy.pausedUntil !== null && policy.pausedUntil.getTime() > now.getTime();
    const deadline = new Date(cycle.dueAt.getTime() + CONFIRMATION_WINDOW_DAYS * DAY_MS);
    const timeZone = cycle.user.profile?.timeZone || "UTC";
    let remindersSent = 0;
    if (!paused) {
      const sentOffsets = cycle.events
        .filter((event) => event.type === "notice_sent" || event.type === "reminder_sent")
        .map((event) => event.offsetDays)
        .filter((offset): offset is number => offset !== null);
      const offsets = dueReminderOffsets({
        dueAt: cycle.dueAt,
        now,
        sentOffsets,
        pausedUntil: policy.pausedUntil,
        offsets: CHECK_IN_NOTICE_OFFSETS,
      });
      for (const offset of offsets) {
        const windowFinal = offset === CONFIRMATION_WINDOW_FINAL_OFFSET_DAYS;
        const templateId = offset === 0 ? "check_in_due" : windowFinal ? "check_in_window_final" : "check_in_reminder";
        const stage = offset === 0 ? "missed_check_in" : offset === 7 ? "second_warning" : offset === 14 ? "final_warning" : "confirmation_window_final";
        const token = randomToken(32);
        const saved = await tx.checkInConfirmationToken.create({
          data: { userId: cycle.userId, tokenHash: sha256(token), expiresAt: deadline },
        });
        const link = `${env.WEB_ORIGIN}/check-in/confirm?token=${token}`;
        const timing = {
          localDeadline: formatZoned(deadline, timeZone),
          utcDeadline: deadline.toISOString(),
          timeZone,
        };
        const notice = await deliverEmail(tx, {
          to: cycle.user.email,
          templateId,
          variables: {
            authorName: cycle.user.profile?.displayName || "there",
            stage,
            channel: "email",
            link,
            ...timing,
          },
          idempotencyKey: reminderKey(cycle.id, offset, "email"),
          relatedType: "check_in_cycle",
          relatedId: cycle.id,
          userId: cycle.userId,
          generation: policy.warningGeneration,
          scheduledAt: now,
        });
        if (notice.status !== "sent" || !notice.providerMessageId) {
          await tx.checkInConfirmationToken.delete({ where: { id: saved.id } });
          continue;
        }
        if (notice.replayed) {
          await tx.checkInConfirmationToken.delete({ where: { id: saved.id } });
        } else {
          await tx.checkInConfirmationToken.deleteMany({
            where: { userId: cycle.userId, usedAt: null, id: { not: saved.id } },
          });
        }
        const already = cycle.events.some(
          (event) => event.offsetDays === offset && (event.type === "notice_sent" || event.type === "reminder_sent"),
        );
        if (!already) {
          await tx.checkInEvent.create({
            data: {
              cycleId: cycle.id,
              type: offset === 0 ? "notice_sent" : "reminder_sent",
              offsetDays: offset,
              at: now,
              notificationId: notice.id,
            },
          });
          remindersSent += 1;
          cycle.events.push({
            id: "pending",
            cycleId: cycle.id,
            type: offset === 0 ? "notice_sent" : "reminder_sent",
            offsetDays: offset,
            at: now,
            notificationId: notice.id,
          });
        }
        await tx.checkInPolicy.update({
          where: { userId: cycle.userId },
          data: {
            lastNotificationSentAt: now,
            ...(offset === 0
              ? {
                  confirmationRequestedAt: now,
                  confirmationDeadline: deadline,
                  accountCheckStatus: "awaiting_confirmation",
                  escalationStatus: "none",
                }
              : {}),
          },
        });
        if (isTestMode()) {
          await deliverEmail(tx, {
            to: `sms-mock:${cycle.user.email}`,
            channel: "sms",
            templateId,
            variables: {
              authorName: cycle.user.profile?.displayName || "there",
              stage,
              channel: "sms",
            },
            idempotencyKey: reminderKey(cycle.id, offset, "sms"),
            relatedType: "check_in_cycle",
            relatedId: cycle.id,
            userId: cycle.userId,
            generation: policy.warningGeneration,
            scheduledAt: now,
          });
        } else {
          const consent = await tx.consentRecord.findFirst({
            where: { userId: cycle.userId, purpose: "sms_check_in", revokedAt: null },
          });
          const phone = cycle.user.profile?.phoneE164 ?? "";
          if (maySendLiveSms({
            phone,
            channelEnabled: Boolean(cycle.user.profile?.checkInChannelSms),
            consentActive: Boolean(consent),
          })) {
            await deliverEmail(tx, {
              to: phone,
              channel: "sms",
              templateId,
              variables: {
                authorName: cycle.user.profile?.displayName || "there",
                stage,
                channel: "sms",
                link,
              },
              idempotencyKey: reminderKey(cycle.id, offset, "sms"),
              relatedType: "check_in_cycle",
              relatedId: cycle.id,
              userId: cycle.userId,
              generation: policy.warningGeneration,
              scheduledAt: now,
            });
          }
        }
      }
      if (offsets.some((offset) => offset > 0)) {
        await tx.checkInCycle.update({ where: { id: cycle.id }, data: { state: "reminded" } });
      }
    }
    let confirmationEscalations = 0;
    const current = await tx.checkInPolicy.findUniqueOrThrow({ where: { userId: cycle.userId } });
    if (!paused && now.getTime() >= deadline.getTime() && current.escalationStatus !== "pending") {
      const notice = await deliverEmail(tx, {
        to: cycle.user.email,
        templateId: "check_in_escalation",
        variables: { authorName: cycle.user.profile?.displayName || "there", channel: "email" },
        idempotencyKey: `check-in:${cycle.id}:escalation`,
        relatedType: "check_in_cycle",
        relatedId: cycle.id,
      });
      if (notice.status === "sent" && notice.providerMessageId) {
        await tx.checkInPolicy.update({
          where: { userId: cycle.userId },
          data: { escalationStatus: "pending", accountCheckStatus: "escalation_pending", confirmationDeadline: deadline },
        });
        await audit(tx, {
          actorUserId: cycle.userId,
          action: "check_in.escalation_pending",
          entityType: "check_in_policy",
          entityId: cycle.userId,
          metadata: { cycleId: cycle.id, deadline: deadline.toISOString() },
        });
        confirmationEscalations = notice.replayed ? 0 : 1;
      }
    }
    return { remindersSent, confirmationEscalations };
  }, { timeout: 20_000 });
}
