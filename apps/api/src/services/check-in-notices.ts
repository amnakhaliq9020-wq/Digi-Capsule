import type { PrismaClient } from "@digi/db";
import { checkInNoticeKey } from "@digi/domain";
import {
  CHECK_IN_NOTICE_OFFSETS,
  CONFIRMATION_WINDOW_DAYS,
  CONFIRMATION_WINDOW_FINAL_OFFSET_DAYS,
} from "@digi/shared";
import { dueReminderOffsets } from "@digi/domain";
import { env, isTestMode } from "../env";
import { randomToken, sha256 } from "../lib/crypto";
import { audit } from "../lib/audit";
import { isUniqueViolation } from "../errors";
import { dispatchNotice, enqueueNotice } from "../lib/notify";
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

function noticeKind(offset: number): string {
  if (offset === 0) return "missed_check_in";
  if (offset === 7) return "second_warning";
  if (offset === 14) return "final_warning";
  return "confirmation_window_final";
}

type OutboxJob = { id: string; offset: number | null; channel: "email" | "sms"; templateId: string };

/**
 * Commits the check-in outbox row before any provider call.
 * A missed check-in does not release a memory.
 * The cycle lock keeps two workers from reserving the same warning twice.
 */
export async function sendDueCheckInNotices(prisma: PrismaClient, cycleId: string, now: Date, workerId = `worker:${process.pid}`) {
  const reserved = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${cycleId})::bigint)`;
    const cycle = await tx.checkInCycle.findUnique({
      where: { id: cycleId },
      include: { events: true, user: { include: { profile: true, checkInPolicy: true } } },
    });
    const policy = cycle?.user.checkInPolicy;
    if (!cycle || !policy || !cycle.user.email) return [] as OutboxJob[];
    if (!["due", "reminded", "missed_unreachable"].includes(cycle.state)) return [] as OutboxJob[];
    const paused = policy.pausedUntil !== null && policy.pausedUntil.getTime() > now.getTime();
    const deadline = new Date(cycle.dueAt.getTime() + CONFIRMATION_WINDOW_DAYS * DAY_MS);
    const timeZone = cycle.user.profile?.timeZone || "UTC";
    const jobs: OutboxJob[] = [];
    const ready = async (id: string) => {
      const row = await tx.notificationDelivery.findUnique({ where: { id } });
      if (!row) return false;
      if (row.status === "pending" || row.status === "queued") return true;
      if (row.status === "failed" && row.retryable && (!row.nextAttemptAt || row.nextAttemptAt.getTime() <= now.getTime())) return true;
      return false;
    };
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
        const stage = noticeKind(offset);
        const key = checkInNoticeKey({
          userId: cycle.userId,
          cycleId: cycle.id,
          generation: policy.warningGeneration,
          kind: stage,
          channel: "email",
        });
        const existing = await tx.notificationDelivery.findUnique({ where: { idempotencyKey: key } });
        let noticeId = existing?.id;
        if (!existing) {
          const token = randomToken(32);
          await tx.checkInConfirmationToken.create({
            data: { userId: cycle.userId, tokenHash: sha256(token), expiresAt: deadline },
          });
          const reservedNotice = await enqueueNotice(tx, {
            to: cycle.user.email,
            templateId,
            variables: {
              authorName: cycle.user.profile?.displayName || "there",
              stage,
              channel: "email",
              link: `${env.WEB_ORIGIN}/check-in/confirm?token=${token}`,
              localDeadline: formatZoned(deadline, timeZone),
              utcDeadline: deadline.toISOString(),
              timeZone,
            },
            idempotencyKey: key,
            relatedType: "check_in_cycle",
            relatedId: cycle.id,
            userId: cycle.userId,
            generation: policy.warningGeneration,
            scheduledAt: now,
            now,
          });
          noticeId = reservedNotice.id;
        }
        if (noticeId && await ready(noticeId)) jobs.push({ id: noticeId, offset, channel: "email", templateId });
      }
    }
    if (!paused && now.getTime() >= deadline.getTime() && policy.escalationStatus !== "pending") {
      const key = checkInNoticeKey({
        userId: cycle.userId,
        cycleId: cycle.id,
        generation: policy.warningGeneration,
        kind: "escalation",
        channel: "email",
      });
      const existing = await tx.notificationDelivery.findUnique({ where: { idempotencyKey: key } });
      const notice = existing ?? await enqueueNotice(tx, {
        to: cycle.user.email,
        templateId: "check_in_escalation",
        variables: { authorName: cycle.user.profile?.displayName || "there", channel: "email" },
        idempotencyKey: key,
        relatedType: "check_in_cycle",
        relatedId: cycle.id,
        userId: cycle.userId,
        generation: policy.warningGeneration,
        scheduledAt: now,
        now,
      });
      const noticeId = "id" in notice ? notice.id : existing?.id;
      if (noticeId && await ready(noticeId)) jobs.push({ id: noticeId, offset: null, channel: "email", templateId: "check_in_escalation" });
    }
    return jobs;
  });

  let remindersSent = 0;
  let confirmationEscalations = 0;
  for (const job of reserved) {
    const queued = await prisma.notificationDelivery.findUnique({ where: { id: job.id } });
    const savedPayload = queued?.payload && typeof queued.payload === "object" && !Array.isArray(queued.payload)
      ? { ...(queued.payload as Record<string, string>) }
      : null;
    const notice = await dispatchNotice(prisma, job.id, now, workerId);
    if (notice.status !== "sent" || !notice.providerMessageId) continue;
    if (job.offset === null) {
      const recorded = await prisma.$transaction(async (tx) => {
        const row = await tx.notificationDelivery.findUnique({ where: { id: job.id } });
        const policy = row?.userId ? await tx.checkInPolicy.findUnique({ where: { userId: row.userId } }) : null;
        if (!row?.userId || !policy || policy.escalationStatus === "pending") return false;
        if (policy.warningGeneration !== row.generationId) return false;
        const cycle = await tx.checkInCycle.findUnique({ where: { id: row.relatedId } });
        if (!cycle) return false;
        const deadline = new Date(cycle.dueAt.getTime() + CONFIRMATION_WINDOW_DAYS * DAY_MS);
        await tx.checkInPolicy.update({
          where: { userId: row.userId },
          data: { escalationStatus: "pending", accountCheckStatus: "escalation_pending", confirmationDeadline: deadline },
        });
        await audit(tx, {
          actorUserId: row.userId,
          action: "check_in.escalation_pending",
          entityType: "check_in_policy",
          entityId: row.userId,
          metadata: { cycleId: cycle.id, deadline: deadline.toISOString() },
        });
        return true;
      });
      if (recorded) confirmationEscalations += 1;
      continue;
    }
    const recorded = await prisma.$transaction(async (tx) => {
      const row = await tx.notificationDelivery.findUnique({ where: { id: job.id } });
      if (!row?.userId || row.generationId === null) return false;
      const policy = await tx.checkInPolicy.findUnique({ where: { userId: row.userId } });
      if (!policy || policy.warningGeneration !== row.generationId) return false;
      try {
        await tx.checkInEvent.create({
          data: {
            cycleId: row.relatedId,
            type: job.offset === 0 ? "notice_sent" : "reminder_sent",
            offsetDays: job.offset,
            at: now,
            notificationId: row.id,
          },
        });
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
        return false;
      }
      const cycle = await tx.checkInCycle.findUnique({ where: { id: row.relatedId } });
      const deadline = cycle ? new Date(cycle.dueAt.getTime() + CONFIRMATION_WINDOW_DAYS * DAY_MS) : null;
      await tx.checkInPolicy.update({
        where: { userId: row.userId },
        data: {
          lastNotificationSentAt: now,
          ...(job.offset === 0 && deadline
            ? {
                confirmationRequestedAt: now,
                confirmationDeadline: deadline,
                accountCheckStatus: "awaiting_confirmation",
                escalationStatus: "none",
              }
            : {}),
        },
      });
      if (job.offset > 0) {
        await tx.checkInCycle.updateMany({
          where: { id: row.relatedId, state: { in: ["due", "reminded", "missed_unreachable"] } },
          data: { state: "reminded" },
        });
      }
      return true;
    });
    if (!recorded) continue;
    remindersSent += 1;
    const source = queued;
    const payload = savedPayload;
    if (isTestMode() && payload && source?.userId && source.generationId !== null) {
      const sms = await enqueueNotice(prisma, {
        to: `sms-mock:${payload.to || ""}`,
        channel: "sms",
        templateId: job.templateId,
        variables: { authorName: payload.authorName || "there", stage: payload.stage || noticeKind(job.offset), channel: "sms" },
        idempotencyKey: checkInNoticeKey({
          userId: source.userId,
          cycleId: source.relatedId,
          generation: source.generationId,
          kind: noticeKind(job.offset),
          channel: "sms",
        }),
        relatedType: "check_in_cycle",
        relatedId: source.relatedId,
        userId: source.userId,
        generation: source.generationId,
        scheduledAt: now,
        now,
      });
      await dispatchNotice(prisma, sms.id, now, workerId);
    } else if (source?.userId && payload) {
      const consent = await prisma.consentRecord.findFirst({
        where: { userId: source.userId, purpose: "sms_check_in", revokedAt: null },
      });
      const profile = await prisma.profile.findUnique({ where: { userId: source.userId } });
      const phone = profile?.phoneE164 ?? "";
      if (maySendLiveSms({ phone, channelEnabled: Boolean(profile?.checkInChannelSms), consentActive: Boolean(consent) }) && source.generationId !== null) {
        const sms = await enqueueNotice(prisma, {
          to: phone,
          channel: "sms",
          templateId: job.templateId,
          variables: {
            authorName: payload.authorName || "there",
            stage: payload.stage || noticeKind(job.offset),
            channel: "sms",
            link: payload.link || "",
          },
          idempotencyKey: checkInNoticeKey({
            userId: source.userId,
            cycleId: source.relatedId,
            generation: source.generationId,
            kind: noticeKind(job.offset),
            channel: "sms",
          }),
          relatedType: "check_in_cycle",
          relatedId: source.relatedId,
          userId: source.userId,
          generation: source.generationId,
          scheduledAt: now,
          now,
        });
        await dispatchNotice(prisma, sms.id, now, workerId);
      }
    }
  }
  return { remindersSent, confirmationEscalations };
}
