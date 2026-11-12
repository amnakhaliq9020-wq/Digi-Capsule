import { Prisma, type PrismaClient } from "@digi/db";
import type { VerificationState as StoredVerificationState } from "@prisma/client";
import {
  calendarJobKey,
  memoryReadyKey,
  daysOverdue,
  DELIVERY_ZONE_LOOKAHEAD_MS,
  earliestDelivery,
  shouldNotifyTrustedContacts,
  shouldRecordSimulatedRelease,
  simulatedReleaseKey,
  testCheckInJobKey,
  unreachableNoticeKey,
  verificationJobKey,
  verificationReducer,
  type VerificationState,
} from "@digi/domain";
import { CANCELLATION_WINDOW_HOURS, MAX_RELEASE_ATTEMPTS, SIMULATED_RELEASE_AFTER_DAYS, UNREACHABLE_AFTER_DAYS } from "@digi/shared";
import { isTestMode, isVerificationReleaseEnabled } from "../env";
import { attemptBudgetExhausted, leaseMs, logDelivery, retryDelayMs } from "../lib/delivery-policy";
import { decryptText } from "../lib/crypto";
import { isUniqueViolation } from "../errors";
import { currentInstant, readDeveloperClock } from "../lib/clock";
import { deliverEmail } from "../lib/notify";
import { sendDueCheckInNotices } from "./check-in-notices";
import { purgeExpiredShareLinks } from "./media-shares";
import { recipientTimeZones, zonedDelivery } from "./recipient-clock";

const HOUR_MS = 60 * 60 * 1000;

function storedState(state: VerificationState): StoredVerificationState {
  if (state === "none") throw new Error("A review cannot be stored before it is opened.");
  return state;
}

export async function runWorkerTick(prisma: PrismaClient, options?: { simulated?: boolean; ownerUserId?: string; workerId?: string }) {
  const now = options?.simulated ? await readDeveloperClock(prisma) : await currentInstant(prisma);
  const ownerUserId = options?.ownerUserId;
  const workerId = options?.workerId || `worker:${process.pid}`;
  await recoverStuckDeliveries(prisma, now, workerId);
  await purgeExpiredShareLinks(prisma, now);
  const calendarJobsSent = await processCalendar(prisma, now, ownerUserId, workerId);
  const { remindersSent, simulatedReleasesRecorded, confirmationEscalations } = await processReminders(prisma, now, ownerUserId, workerId);
  let verificationJobsSent = 0;
  if (isTestMode() || isVerificationReleaseEnabled()) {
    await advanceVerificationWindows(prisma, now, ownerUserId);
  }
  if (isVerificationReleaseEnabled()) {
    verificationJobsSent = await processVerificationReleases(prisma, now, ownerUserId, workerId);
  }
  return { now, calendarJobsSent, remindersSent, simulatedReleasesRecorded, verificationJobsSent, confirmationEscalations };
}

async function cancelSupersededJobs(prisma: PrismaClient, now: Date, workerId: string) {
  await prisma.$executeRaw`
    UPDATE release_jobs AS job
    SET status = 'cancelled',
        cancelled_at = ${now},
        last_error = 'superseded',
        retryable = false,
        worker_id = ${workerId}
    FROM capsule_items AS item
    WHERE job.capsule_item_id = item.id
      AND job.schedule_generation <> item.schedule_generation
      AND job.status IN ('pending', 'failed', 'sending', 'processing')
      AND job.dispatch_started_at IS NULL
  `;
}

async function processCalendar(prisma: PrismaClient, now: Date, ownerUserId?: string, workerId = `worker:${process.pid}`) {
  await cancelSupersededJobs(prisma, now, workerId);
  const horizon = new Date(now.getTime() + DELIVERY_ZONE_LOOKAHEAD_MS);
  const rules = await prisma.releaseRule.findMany({
    where: {
      status: "active",
      trigger: "exact_time",
      nextRunAt: { lte: horizon },
      ...(ownerUserId ? { item: { capsule: { ownerUserId } } } : {}),
    },
    include: {
      item: {
        include: {
          capsule: { include: { owner: { include: { profile: true } } } },
          grants: { where: { revokedAt: null, visibility: "released_only" }, include: { person: true } },
        },
      },
    },
  });
  let sent = 0;
  for (const rule of rules) {
    const freshRule = await prisma.releaseRule.findUnique({ where: { id: rule.id } });
    if (!freshRule || freshRule.status !== "active" || freshRule.trigger !== "exact_time") continue;
    if (!freshRule.localDate || !freshRule.localTime || !freshRule.nextRunAt) continue;
    const freshItem = await prisma.capsuleItem.findUnique({ where: { id: rule.item.id } });
    if (!freshItem || freshItem.status === "cancelled" || freshItem.status === "released") continue;
    const zones = await recipientTimeZones(prisma, rule.item.grants.map((grant) => grant.person), freshRule.timeZone);
    const plans = rule.item.grants.flatMap((grant) => {
      const timeZone = zones.get(grant.person.id) || freshRule.timeZone;
      try {
        return [{ grant, occursAt: zonedDelivery(freshRule.localDate!, freshRule.localTime!, timeZone) }];
      } catch {
        return [];
      }
    });
    for (const plan of plans) {
      if (!plan.grant.person.email || plan.occursAt.getTime() > now.getTime()) continue;
      const stillActive = await prisma.releaseRule.findUnique({ where: { id: rule.id }, select: { status: true } });
      if (stillActive?.status !== "active") break;
      const key = calendarJobKey(rule.item.id, plan.grant.person.id, plan.occursAt.toISOString(), freshItem.scheduleGeneration);
      const didSend = await sendMemoryJob(prisma, {
        idempotencyKey: key,
        releaseRuleId: rule.id,
        verificationCaseId: null,
        capsuleItemId: rule.item.id,
        personId: plan.grant.person.id,
        occurrenceAt: plan.occursAt,
        to: plan.grant.person.email,
        authorName: rule.item.capsule.owner.profile?.displayName || "Someone",
        scheduleGeneration: freshItem.scheduleGeneration,
        now,
        workerId,
      });
      if (didSend) sent += 1;
    }
    const jobs = await prisma.releaseJob.findMany({ where: { capsuleItemId: rule.item.id, status: "sent" } });
    const sentPeople = new Set(jobs.map((job) => job.personId));
    const emailGrants = rule.item.grants.filter((grant) => grant.person.email);
    const pending = plans.filter((plan) => plan.grant.person.email && !sentPeople.has(plan.grant.person.id));
    if (emailGrants.length > 0 && pending.length === 0) {
      await prisma.releaseRule.update({ where: { id: rule.id }, data: { status: "completed", nextRunAt: null } });
      await prisma.capsuleItem.update({
        where: { id: rule.item.id },
        data: { status: "released", releasedAt: now },
      });
      continue;
    }
    if (pending.length > 0) {
      const next = earliestDelivery(pending.map((plan) => plan.occursAt));
      if (freshRule.nextRunAt.getTime() !== next.getTime()) {
        await prisma.releaseRule.update({ where: { id: rule.id }, data: { nextRunAt: next } });
      }
    }
  }
  return sent;
}

async function processVerificationReleases(prisma: PrismaClient, now: Date, ownerUserId?: string, workerId = `worker:${process.pid}`) {
  const cases = await prisma.verificationCase.findMany({
    where: {
      ...(ownerUserId ? { subjectUserId: ownerUserId } : {}),
      OR: [
        { state: "release_authorized", cancellationWindowEndsAt: { lte: now } },
        { state: "releasing" },
      ],
    },
  });
  let sent = 0;
  for (const review of cases) {
    const fresh = await prisma.verificationCase.findUnique({ where: { id: review.id } });
    if (!fresh || (fresh.state !== "release_authorized" && fresh.state !== "releasing")) continue;
    const rules = await prisma.releaseRule.findMany({
      where: {
        status: "active",
        trigger: "after_verification",
        item: { status: "scheduled", capsule: { ownerUserId: fresh.subjectUserId } },
      },
      include: {
        item: {
          include: {
            capsule: { include: { owner: { include: { profile: true } } } },
            grants: { where: { revokedAt: null, visibility: "released_only" }, include: { person: true } },
          },
        },
      },
    });
    for (const rule of rules) {
      for (const grant of rule.item.grants) {
        if (!grant.person.email) continue;
        const currentItem = await prisma.capsuleItem.findUnique({ where: { id: rule.item.id }, select: { scheduleGeneration: true } });
        const key = verificationJobKey(fresh.id, rule.item.id, grant.person.id);
        const didSend = await sendMemoryJob(prisma, {
          idempotencyKey: key,
          releaseRuleId: rule.id,
          verificationCaseId: fresh.id,
          capsuleItemId: rule.item.id,
          personId: grant.person.id,
          occurrenceAt: now,
          to: grant.person.email,
          authorName: rule.item.capsule.owner.profile?.displayName || "Someone",
          scheduleGeneration: currentItem?.scheduleGeneration ?? rule.item.scheduleGeneration,
          now,
          workerId,
        });
      if (didSend) sent += 1;
      }
      const jobs = await prisma.releaseJob.findMany({
        where: { verificationCaseId: fresh.id, capsuleItemId: rule.item.id },
      });
      if (rule.item.grants.length > 0 && jobs.filter((job) => job.status === "sent").length >= rule.item.grants.length) {
        await prisma.capsuleItem.update({
          where: { id: rule.item.id },
          data: { status: "released", releasedAt: now },
        });
        await prisma.releaseRule.update({ where: { id: rule.id }, data: { status: "completed" } });
      }
    }
    const jobRows = await prisma.releaseJob.findMany({ where: { verificationCaseId: fresh.id } });
    if (jobRows.length === 0) continue;
    const allDone = jobRows.every((job) => job.status === "sent" || job.status === "dead");
    let finalState = fresh.state as VerificationState;
    if (fresh.state === "release_authorized") {
      const next = verificationReducer(fresh.state, { type: "jobs_created" });
      finalState = allDone
        ? verificationReducer(next.state, { type: "all_jobs_sent_or_dead" }).state
        : next.state;
    } else if (allDone) {
      finalState = verificationReducer("releasing", { type: "all_jobs_sent_or_dead" }).state;
    }
    if (finalState === fresh.state) continue;
    await prisma.verificationCase.update({
      where: { id: fresh.id, state: fresh.state },
      data: {
        state: storedState(finalState),
        resolution: finalState === "released" ? "authorized" : fresh.resolution,
        resolvedAt: finalState === "released" ? now : null,
      },
    });
  }
  return sent;
}

export async function recoverStuckDeliveries(prisma: PrismaClient, now: Date, workerId: string) {
  const staleBefore = new Date(now.getTime() - leaseMs());
  const safe = await prisma.releaseJob.updateMany({
    where: { status: { in: ["sending", "processing"] }, dispatchStartedAt: null, claimedAt: { lt: staleBefore } },
    data: { status: "pending", workerId, lastError: "claim_expired_before_dispatch" },
  });
  const uncertain = await prisma.releaseJob.updateMany({
    where: {
      status: { in: ["sending", "processing"] },
      dispatchStartedAt: { not: null },
      providerMessageId: null,
      claimedAt: { lt: staleBefore },
    },
    data: { status: "uncertain", workerId, lastError: "dispatch_unconfirmed", retryable: false },
  });
  const requeuedNotices = await prisma.notificationDelivery.updateMany({
    where: { status: "processing", dispatchStartedAt: null, claimedAt: { lt: staleBefore } },
    data: { status: "pending", workerId, errorCode: "claim_expired_before_dispatch" },
  });
  const notices = await prisma.notificationDelivery.updateMany({
    where: {
      status: "processing",
      dispatchStartedAt: { not: null },
      providerMessageId: null,
      claimedAt: { lt: staleBefore },
    },
    data: {
      status: "uncertain",
      workerId,
      errorCode: "dispatch_unconfirmed",
      retryable: false,
      providerResponse: "timeout_after_possible_acceptance",
      payload: Prisma.DbNull,
    },
  });
  if (safe.count || uncertain.count || notices.count || requeuedNotices.count) {
    logDelivery({
      event: "recover",
      workerId,
      requeued: safe.count + requeuedNotices.count,
      uncertainJobs: uncertain.count,
      uncertainNotices: notices.count,
    });
  }
}

const OPEN_CHECK_IN = ["due", "reminded", "missed_unreachable"] as const;

function testReleaseCycleId(idempotencyKey: string): string | null {
  const match = /^test-check-in:([0-9a-f-]{36}):/i.exec(idempotencyKey);
  return match?.[1] ?? null;
}

async function testReleaseStillOpen(tx: Prisma.TransactionClient, idempotencyKey: string) {
  const cycleId = testReleaseCycleId(idempotencyKey);
  if (!cycleId) return true;
  const cycle = await tx.checkInCycle.findUnique({ where: { id: cycleId }, select: { state: true } });
  return Boolean(cycle && OPEN_CHECK_IN.includes(cycle.state as (typeof OPEN_CHECK_IN)[number]));
}

async function deliveryStillCurrent(
  tx: Prisma.TransactionClient,
  input: { capsuleItemId: string; releaseRuleId: string; personId: string; scheduleGeneration: number; occurrenceAt: Date; now: Date },
) {
  const item = await tx.capsuleItem.findUnique({ where: { id: input.capsuleItemId } });
  const rule = await tx.releaseRule.findUnique({ where: { id: input.releaseRuleId } });
  const grant = await tx.itemGrant.findFirst({
    where: { capsuleItemId: input.capsuleItemId, personId: input.personId, revokedAt: null, visibility: "released_only" },
  });
  const person = await tx.person.findUnique({ where: { id: input.personId }, select: { email: true } });
  const current = Boolean(
    item
    && item.status === "scheduled"
    && item.scheduleGeneration === input.scheduleGeneration
    && rule
    && rule.status === "active"
    && rule.capsuleItemId === input.capsuleItemId
    && grant
    && person?.email
    && input.occurrenceAt.getTime() <= input.now.getTime(),
  );
  return { current, item };
}

async function sendMemoryJob(
  prisma: PrismaClient,
  input: {
    idempotencyKey: string;
    releaseRuleId: string;
    verificationCaseId: string | null;
    capsuleItemId: string;
    personId: string;
    occurrenceAt: Date;
    to: string;
    authorName: string;
    scheduleGeneration: number;
    now?: Date;
    workerId?: string;
  },
) {
  const now = input.now ?? new Date();
  const workerId = input.workerId || `worker:${process.pid}`;
  const noticeKey = memoryReadyKey(input.capsuleItemId, input.personId, input.occurrenceAt.toISOString(), input.scheduleGeneration);
  const claimed = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT id FROM capsule_items WHERE id = ${input.capsuleItemId}::uuid FOR UPDATE`;
    const gate = await deliveryStillCurrent(tx, { ...input, now });
    const releaseOpen = await testReleaseStillOpen(tx, input.idempotencyKey);
    if (!gate.current || !releaseOpen) {
      await tx.releaseJob.updateMany({
        where: {
          capsuleItemId: input.capsuleItemId,
          personId: input.personId,
          scheduleGeneration: input.scheduleGeneration,
          status: { in: ["pending", "failed", "sending", "processing"] },
          dispatchStartedAt: null,
        },
        data: { status: "cancelled", cancelledAt: now, workerId, lastError: "superseded", retryable: false },
      });
      return null;
    }
    const blocking = await tx.releaseJob.findFirst({
      where: {
        capsuleItemId: input.capsuleItemId,
        personId: input.personId,
        occurrenceAt: input.occurrenceAt,
        status: { notIn: ["cancelled", "dead"] },
      },
    });
    if (blocking && blocking.scheduleGeneration !== input.scheduleGeneration) {
      if (blocking.dispatchStartedAt || blocking.status === "sent" || blocking.status === "delivered" || blocking.status === "uncertain") return null;
      await tx.releaseJob.update({
        where: { id: blocking.id },
        data: { status: "cancelled", cancelledAt: now, workerId, lastError: "superseded", retryable: false },
      });
    }
    let job = await tx.releaseJob.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
    if (!job) {
      try {
        job = await tx.releaseJob.create({
          data: {
            idempotencyKey: input.idempotencyKey,
            releaseRuleId: input.releaseRuleId,
            verificationCaseId: input.verificationCaseId,
            capsuleItemId: input.capsuleItemId,
            personId: input.personId,
            occurrenceAt: input.occurrenceAt,
            scheduleGeneration: input.scheduleGeneration,
            status: "pending",
          },
        });
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
        job = await tx.releaseJob.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
      }
    }
    if (!job || job.scheduleGeneration !== input.scheduleGeneration) return null;
    if (job.status === "sent" || job.status === "delivered" || job.status === "dead" || job.status === "uncertain" || job.status === "cancelled") return null;
    if (job.status === "failed" && (!job.retryable || (job.nextAttemptAt && job.nextAttemptAt.getTime() > now.getTime()))) return null;
    if (attemptBudgetExhausted(job.attemptCount) && job.status !== "pending") {
      await tx.releaseJob.update({ where: { id: job.id }, data: { status: "dead", retryable: false, lastError: "attempt_budget", workerId } });
      return null;
    }
    const updated = await tx.releaseJob.updateMany({
      where: { id: job.id, status: { in: ["pending", "failed"] }, scheduleGeneration: input.scheduleGeneration },
      data: { status: "processing", attemptCount: { increment: 1 }, claimedAt: now, workerId, lastError: null, nextAttemptAt: null, dispatchStartedAt: now },
    });
    if (updated.count !== 1) return null;
    const fresh = await tx.releaseJob.findUniqueOrThrow({ where: { id: job.id } });
    return { id: fresh.id, attemptCount: fresh.attemptCount };
  });
  if (!claimed) return false;
  logDelivery({
    event: "memory_dispatch",
    jobId: claimed.id,
    idempotencyKey: input.idempotencyKey,
    memoryId: input.capsuleItemId,
    recipientId: input.personId,
    attempt: claimed.attemptCount,
    workerId,
  });
  const packaged = isTestMode() ? await testDeliveryCopy(prisma, input.capsuleItemId) : null;
  const notice = await deliverEmail(prisma, {
    to: input.to,
    templateId: "memory_ready",
    variables: {
      authorName: input.authorName,
      itemId: input.capsuleItemId,
      personId: input.personId,
      summary: "A memory is ready for them.",
      ...(packaged ? { title: packaged.title, letter: packaged.letter, files: packaged.files } : {}),
    },
    idempotencyKey: noticeKey,
    relatedType: "release_job",
    relatedId: claimed.id,
    now,
    workerId,
  });
  if (notice.status === "sent" || notice.status === "delivered") {
    const granted = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT id FROM capsule_items WHERE id = ${input.capsuleItemId}::uuid FOR UPDATE`;
      const gate = await deliveryStillCurrent(tx, { ...input, now });
      const releaseOpen = await testReleaseStillOpen(tx, input.idempotencyKey);
      if (!gate.current || !releaseOpen) {
        await tx.releaseJob.update({
          where: { id: claimed.id },
          data: {
            status: "cancelled",
            cancelledAt: now,
            providerMessageId: notice.providerMessageId,
            providerResponse: "accepted_then_superseded",
            workerId,
            lastError: "cancelled_after_acceptance",
            retryable: false,
          },
        });
        return false;
      }
      await tx.releaseJob.update({
        where: { id: claimed.id },
        data: {
          status: "sent",
          sentAt: now,
          providerMessageId: notice.providerMessageId,
          providerResponse: "provider_accepted_not_inbox_delivery",
          workerId,
          lastError: null,
        },
      });
      return true;
    });
    if (!granted) return false;
    logDelivery({
      event: "memory_accepted",
      jobId: claimed.id,
      idempotencyKey: input.idempotencyKey,
      memoryId: input.capsuleItemId,
      recipientId: input.personId,
      attempt: claimed.attemptCount,
      workerId,
      providerMessageId: notice.providerMessageId,
      status: "sent",
    });
    return !notice.replayed;
  }
  if (notice.status === "uncertain") {
    await prisma.releaseJob.update({
      where: { id: claimed.id },
      data: { status: "uncertain", retryable: false, workerId, lastError: "dispatch_unconfirmed", providerResponse: "timeout_after_possible_acceptance" },
    });
    return false;
  }
  if (notice.status === "bounced" || notice.status === "cancelled") {
    await prisma.releaseJob.update({
      where: { id: claimed.id },
      data: { status: notice.status === "cancelled" ? "cancelled" : "dead", retryable: false, workerId, lastError: notice.status, cancelledAt: notice.status === "cancelled" ? now : null },
    });
    return false;
  }
  await prisma.releaseJob.updateMany({
    where: { id: claimed.id, status: "processing" },
    data: {
      status: "failed",
      retryable: true,
      workerId,
      lastError: "temporary_failure",
      nextAttemptAt: new Date(now.getTime() + retryDelayMs(claimed.attemptCount)),
      dispatchStartedAt: null,
    },
  });
  return false;
}

async function retryTestCheckInReleases(prisma: PrismaClient, cycleId: string, now: Date, workerId: string) {
  const jobs = await prisma.releaseJob.findMany({
    where: {
      idempotencyKey: { startsWith: `test-check-in:${cycleId}:` },
      status: { in: ["pending", "failed"] },
    },
    include: {
      person: true,
      item: { include: { capsule: { include: { owner: { include: { profile: true } } } }, grants: { where: { revokedAt: null, visibility: "released_only" }, include: { person: true } }, releaseRules: true } },
    },
  });
  for (const job of jobs) {
    if (!job.person.email || !job.releaseRuleId) continue;
    if (job.status === "failed" && (!job.retryable || (job.nextAttemptAt && job.nextAttemptAt.getTime() > now.getTime()))) continue;
    await sendMemoryJob(prisma, {
      idempotencyKey: job.idempotencyKey,
      releaseRuleId: job.releaseRuleId,
      verificationCaseId: job.verificationCaseId,
      capsuleItemId: job.capsuleItemId,
      personId: job.personId,
      occurrenceAt: job.occurrenceAt,
      to: job.person.email,
      authorName: job.item.capsule.owner.profile?.displayName || "Someone",
      scheduleGeneration: job.scheduleGeneration,
      now,
      workerId,
    });
  }
  const itemIds = [...new Set(jobs.map((job) => job.capsuleItemId))];
  for (const itemId of itemIds) {
    const item = jobs.find((job) => job.capsuleItemId === itemId)?.item;
    if (!item || item.status !== "scheduled") continue;
    const rule = item.releaseRules.find((entry) => entry.trigger === "after_verification" && entry.status === "active");
    if (!rule) continue;
    const sentJobs = await prisma.releaseJob.count({ where: { capsuleItemId: itemId, status: "sent" } });
    const emailGrants = item.grants.filter((grant) => grant.person.email);
    if (emailGrants.length > 0 && sentJobs >= emailGrants.length) {
      await prisma.capsuleItem.update({ where: { id: itemId }, data: { status: "released", releasedAt: now } });
      await prisma.releaseRule.update({ where: { id: rule.id }, data: { status: "completed", nextRunAt: null } });
    }
  }
}

async function processReminders(prisma: PrismaClient, now: Date, ownerUserId: string | undefined, workerId: string) {
  const cycles = await prisma.checkInCycle.findMany({
    where: {
      state: { in: ["due", "reminded", "missed_unreachable"] },
      dueAt: { lte: now },
      ...(ownerUserId ? { userId: ownerUserId } : {}),
    },
    include: {
      events: true,
      user: { include: { profile: true, checkInPolicy: true } },
    },
  });
  let sent = 0;
  let simulatedReleasesRecorded = 0;
  let confirmationEscalations = 0;
  for (const cycle of cycles) {
    const policy = cycle.user.checkInPolicy;
    if (!policy || !cycle.user.email) continue;
    const notices = await sendDueCheckInNotices(prisma, cycle.id, now, workerId);
    sent += notices.remindersSent;
    confirmationEscalations += notices.confirmationEscalations;
    const fresh = await prisma.checkInCycle.findUnique({
      where: { id: cycle.id },
      include: { events: true, user: { include: { checkInPolicy: true, profile: true } } },
    });
    const freshPolicy = fresh?.user.checkInPolicy;
    if (!fresh || !freshPolicy || !fresh.user.email || !OPEN_CHECK_IN.includes(fresh.state as (typeof OPEN_CHECK_IN)[number])) continue;
    const paused = freshPolicy.pausedUntil !== null && freshPolicy.pausedUntil.getTime() > now.getTime();
    const simulatedAlready = fresh.events.some((event) => event.type === "simulated_release_recorded");
    if (
      !paused &&
      isTestMode() &&
      shouldRecordSimulatedRelease({
        dueAt: fresh.dueAt,
        now,
        alreadyRecorded: simulatedAlready,
        pausedUntil: freshPolicy.pausedUntil,
      })
    ) {
      const notice = await deliverEmail(prisma, {
        to: fresh.user.email,
        templateId: "simulated_conditional_release",
        variables: { authorName: fresh.user.profile?.displayName || "there" },
        idempotencyKey: simulatedReleaseKey(fresh.id),
        relatedType: "check_in_cycle",
        relatedId: fresh.id,
        userId: fresh.userId,
        generation: freshPolicy.warningGeneration,
        now,
        workerId,
      });
      if ((notice.status === "queued" || notice.status === "sent") && !simulatedAlready && notice.providerMessageId) {
        const stillOpen = await prisma.checkInCycle.findUnique({ where: { id: fresh.id }, select: { state: true } });
        if (stillOpen && OPEN_CHECK_IN.includes(stillOpen.state as (typeof OPEN_CHECK_IN)[number])) {
          await deliverTestCheckInMemories(prisma, fresh.id, fresh.userId, now);
          try {
            await prisma.checkInEvent.create({
              data: {
                cycleId: fresh.id,
                type: "simulated_release_recorded",
                offsetDays: SIMULATED_RELEASE_AFTER_DAYS,
                at: now,
                notificationId: notice.id,
              },
            });
            simulatedReleasesRecorded += 1;
          } catch (error) {
            if (!isUniqueViolation(error)) throw error;
          }
        }
      }
    }
    const afterRelease = await prisma.checkInCycle.findUnique({ where: { id: fresh.id }, include: { events: true } });
    if (isTestMode() && !paused && afterRelease && OPEN_CHECK_IN.includes(afterRelease.state as (typeof OPEN_CHECK_IN)[number])) {
      if (afterRelease.events.some((event) => event.type === "simulated_release_recorded")) {
        await retryTestCheckInReleases(prisma, fresh.id, now, workerId);
      }
    }
    const unreachableAlready = fresh.events.some((event) => event.type === "unreachable_notice_sent")
      || Boolean(afterRelease?.events.some((event) => event.type === "unreachable_notice_sent"));
    if (
      !paused &&
      shouldNotifyTrustedContacts({
        dueAt: fresh.dueAt,
        now,
        alreadySent: unreachableAlready,
        pausedUntil: freshPolicy.pausedUntil,
      })
    ) {
      const contacts = await prisma.person.findMany({
        where: {
          ownerUserId: fresh.userId,
          roles: { some: { role: "trusted_contact", revokedAt: null, channelVerifiedAt: { not: null } } },
        },
      });
      for (const contact of contacts) {
        if (!contact.email) continue;
        await deliverEmail(prisma, {
          to: contact.email,
          templateId: "trusted_contact_unreachable",
          variables: { authorName: fresh.user.profile?.displayName || "The author" },
          idempotencyKey: unreachableNoticeKey(fresh.id, contact.id),
          relatedType: "check_in_cycle",
          relatedId: fresh.id,
          userId: fresh.userId,
          generation: freshPolicy.warningGeneration,
          now,
          workerId,
        });
      }
      try {
        await prisma.$transaction(async (tx) => {
          const current = await tx.checkInCycle.findUnique({ where: { id: fresh.id }, select: { state: true } });
          if (!current || !OPEN_CHECK_IN.includes(current.state as (typeof OPEN_CHECK_IN)[number])) return;
          await tx.checkInEvent.create({
            data: { cycleId: fresh.id, type: "unreachable_notice_sent", offsetDays: UNREACHABLE_AFTER_DAYS, at: now },
          });
          await tx.checkInCycle.updateMany({
            where: { id: fresh.id, state: { in: [...OPEN_CHECK_IN] } },
            data: { state: "missed_unreachable" },
          });
        });
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
      }
    }
  }
  return { remindersSent: sent, simulatedReleasesRecorded, confirmationEscalations };
}

export async function advanceVerificationWindows(prisma: PrismaClient, now: Date, ownerUserId?: string) {
  const cases = await prisma.verificationCase.findMany({
    where: {
      state: { in: ["cooling_off", "cancellation_window"] },
      ...(ownerUserId ? { subjectUserId: ownerUserId } : {}),
    },
  });
  for (const review of cases) {
    if (review.state === "cooling_off" && review.coolingOffEndsAt && review.coolingOffEndsAt <= now) {
      const windowEnd = new Date(review.coolingOffEndsAt.getTime() + CANCELLATION_WINDOW_HOURS * HOUR_MS);
      const elapsed = verificationReducer("cooling_off", { type: "cooling_off_elapsed" });
      let state = elapsed.state;
      let resolution = review.resolution;
      if (windowEnd <= now) {
        state = verificationReducer("cancellation_window", { type: "window_elapsed_without_recovery" }).state;
      }
      await prisma.verificationCase.update({
        where: { id: review.id },
        data: { state: storedState(state), cancellationWindowEndsAt: windowEnd, resolution },
      });
      continue;
    }
    if (
      review.state === "cancellation_window" &&
      review.cancellationWindowEndsAt &&
      review.cancellationWindowEndsAt <= now
    ) {
      const next = verificationReducer("cancellation_window", { type: "window_elapsed_without_recovery" });
      await prisma.verificationCase.update({
        where: { id: review.id },
        data: { state: storedState(next.state) },
      });
    }
  }
}

async function testDeliveryCopy(prisma: PrismaClient, itemId: string) {
  const item = await prisma.capsuleItem.findUnique({
    where: { id: itemId },
    include: { media: { include: { asset: true } } },
  });
  if (!item) return { title: "Memory", letter: "", files: "none" };
  const letter = item.bodyCiphertext && item.bodyNonce && item.bodyTag
    ? decryptText(Buffer.from(item.bodyCiphertext), Buffer.from(item.bodyNonce), Buffer.from(item.bodyTag))
    : "";
  const files = item.media
    .filter((link) => !link.asset.deletedAt)
    .map((link) => `${link.asset.originalName} (${link.asset.mimeType}, ${link.asset.byteSize} bytes)`)
    .join(", ");
  return { title: item.title, letter, files: files || "none" };
}

/** Test mode only. The caller already proved this is the first day-21 record for the cycle. */
async function deliverTestCheckInMemories(prisma: PrismaClient, cycleId: string, userId: string, now: Date) {
  const rules = await prisma.releaseRule.findMany({
    where: {
      status: "active",
      trigger: "after_verification",
      item: { status: "scheduled", capsule: { ownerUserId: userId } },
    },
    include: {
      item: {
        include: {
          capsule: { include: { owner: { include: { profile: true } } } },
          grants: { where: { revokedAt: null, visibility: "released_only" }, include: { person: true } },
        },
      },
    },
  });
  for (const rule of rules) {
    for (const grant of rule.item.grants) {
      if (!grant.person.email) continue;
      await sendMemoryJob(prisma, {
        idempotencyKey: testCheckInJobKey(cycleId, rule.item.id, grant.person.id),
        releaseRuleId: rule.id,
        verificationCaseId: null,
        capsuleItemId: rule.item.id,
        personId: grant.person.id,
        occurrenceAt: now,
        to: grant.person.email,
        authorName: rule.item.capsule.owner.profile?.displayName || "Someone",
        scheduleGeneration: rule.item.scheduleGeneration,
        now,
      });
    }
    const jobs = await prisma.releaseJob.findMany({ where: { releaseRuleId: rule.id, status: "sent" } });
    if (rule.item.grants.length > 0 && jobs.length >= rule.item.grants.length) {
      await prisma.capsuleItem.update({ where: { id: rule.item.id }, data: { status: "released", releasedAt: now } });
      await prisma.releaseRule.update({ where: { id: rule.id }, data: { status: "completed", nextRunAt: null } });
    }
  }
}

export function overdueLabel(dueAt: Date, now: Date): { overdue: boolean; daysOverdue: number } {
  const days = daysOverdue(dueAt, now);
  return { overdue: now.getTime() >= dueAt.getTime(), daysOverdue: days };
}
