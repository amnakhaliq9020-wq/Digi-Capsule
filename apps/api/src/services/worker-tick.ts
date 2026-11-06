import type { PrismaClient } from "@digi/db";
import type { VerificationState as StoredVerificationState } from "@prisma/client";
import {
  calendarJobKey,
  daysOverdue,
  dueReminderOffsets,
  reminderKey,
  shouldNotifyTrustedContacts,
  shouldRecordSimulatedRelease,
  simulatedReleaseKey,
  unreachableNoticeKey,
  verificationJobKey,
  verificationReducer,
  type VerificationState,
} from "@digi/domain";
import { CANCELLATION_WINDOW_HOURS, MAX_RELEASE_ATTEMPTS, REMINDER_OFFSETS_DAYS, SIMULATED_RELEASE_AFTER_DAYS, UNREACHABLE_AFTER_DAYS } from "@digi/shared";
import { isTestMode, isVerificationReleaseEnabled } from "../env";
import { isUniqueViolation } from "../errors";
import { currentInstant } from "../lib/clock";
import { deliverEmail } from "../lib/notify";

const HOUR_MS = 60 * 60 * 1000;

function storedState(state: VerificationState): StoredVerificationState {
  if (state === "none") throw new Error("A review cannot be stored before it is opened.");
  return state;
}

export async function runWorkerTick(prisma: PrismaClient) {
  const now = await currentInstant(prisma);
  const calendarJobsSent = await processCalendar(prisma, now);
  const { remindersSent, simulatedReleasesRecorded } = await processReminders(prisma, now);
  let verificationJobsSent = 0;
  if (isTestMode() || isVerificationReleaseEnabled()) {
    await advanceVerificationWindows(prisma, now);
  }
  if (isVerificationReleaseEnabled()) {
    verificationJobsSent = await processVerificationReleases(prisma, now);
  }
  return { now, calendarJobsSent, remindersSent, simulatedReleasesRecorded, verificationJobsSent };
}

async function processCalendar(prisma: PrismaClient, now: Date) {
  const rules = await prisma.releaseRule.findMany({
    where: { status: "active", trigger: "exact_time", nextRunAt: { lte: now } },
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
    if (!rule.nextRunAt || rule.item.status === "cancelled" || rule.item.status === "released") continue;
    for (const grant of rule.item.grants) {
      if (!grant.person.email) continue;
      const key = calendarJobKey(rule.item.id, grant.person.id, rule.nextRunAt.toISOString());
      const didSend = await sendMemoryJob(prisma, {
        idempotencyKey: key,
        releaseRuleId: rule.id,
        verificationCaseId: null,
        capsuleItemId: rule.item.id,
        personId: grant.person.id,
        occurrenceAt: rule.nextRunAt,
        to: grant.person.email,
        authorName: rule.item.capsule.owner.profile?.displayName || "Someone",
      });
      if (didSend) sent += 1;
    }
    const jobs = await prisma.releaseJob.findMany({ where: { releaseRuleId: rule.id } });
    const activeGrants = rule.item.grants.length;
    const sentJobs = jobs.filter((job) => job.status === "sent");
    if (activeGrants > 0 && sentJobs.length >= activeGrants) {
      await prisma.releaseRule.update({ where: { id: rule.id }, data: { status: "completed", nextRunAt: null } });
      await prisma.capsuleItem.update({
        where: { id: rule.item.id },
        data: { status: "released", releasedAt: now },
      });
    }
  }
  return sent;
}

async function processVerificationReleases(prisma: PrismaClient, now: Date) {
  const cases = await prisma.verificationCase.findMany({
    where: {
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
  },
) {
  let job = await prisma.releaseJob.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
  if (!job) {
    try {
      job = await prisma.releaseJob.create({
        data: {
          idempotencyKey: input.idempotencyKey,
          releaseRuleId: input.releaseRuleId,
          verificationCaseId: input.verificationCaseId,
          capsuleItemId: input.capsuleItemId,
          personId: input.personId,
          occurrenceAt: input.occurrenceAt,
          status: "pending",
        },
      });
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      job = await prisma.releaseJob.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
    }
  }
  if (!job || job.status === "sent" || job.status === "cancelled" || job.status === "dead") return false;
  if (job.attemptCount >= MAX_RELEASE_ATTEMPTS) {
    await prisma.releaseJob.update({ where: { id: job.id }, data: { status: "dead" } });
    return false;
  }
  const claimed = await prisma.releaseJob.updateMany({
    where: { id: job.id, status: { in: ["pending", "failed"] } },
    data: { status: "sending", attemptCount: { increment: 1 } },
  });
  if (claimed.count !== 1) return false;
  try {
    const notice = await deliverEmail(prisma, {
      to: input.to,
      templateId: "memory_ready",
      variables: {
        authorName: input.authorName,
        itemId: input.capsuleItemId,
        personId: input.personId,
        summary: "A memory is ready for them.",
      },
      idempotencyKey: `job:${job.id}:memory_ready`,
      relatedType: "release_job",
      relatedId: job.id,
    });
    await prisma.releaseJob.update({
      where: { id: job.id },
      data: { status: "sent", sentAt: new Date(), providerMessageId: notice.id },
    });
    return true;
  } catch (error) {
    await prisma.releaseJob.update({
      where: { id: job.id },
      data: { status: "failed" },
    });
    console.error("[worker] delivery failed", error instanceof Error ? error.message : "unknown");
    return false;
  }
}

async function processReminders(prisma: PrismaClient, now: Date) {
  const cycles = await prisma.checkInCycle.findMany({
    where: { state: { in: ["due", "reminded", "missed_unreachable"] }, dueAt: { lte: now } },
    include: {
      events: true,
      user: { include: { profile: true, checkInPolicy: true } },
    },
  });
  let sent = 0;
  let simulatedReleasesRecorded = 0;
  for (const cycle of cycles) {
    const policy = cycle.user.checkInPolicy;
    if (!policy || !cycle.user.email) continue;
    const sentOffsets = cycle.events
      .filter((event) => event.type === "notice_sent" || event.type === "reminder_sent")
      .map((event) => event.offsetDays)
      .filter((offset): offset is number => offset !== null);
    const offsets = dueReminderOffsets({
      dueAt: cycle.dueAt,
      now,
      sentOffsets,
      pausedUntil: policy.pausedUntil,
      offsets: REMINDER_OFFSETS_DAYS,
    });
    for (const offset of offsets) {
      const templateId = offset === 0 ? "check_in_due" : "check_in_reminder";
      const stage = offset === 0 ? "missed_check_in" : offset === 7 ? "second_warning" : "final_warning";
      const notice = await deliverEmail(prisma, {
        to: cycle.user.email,
        templateId,
        variables: {
          authorName: cycle.user.profile?.displayName || "there",
          stage,
        },
        idempotencyKey: reminderKey(cycle.id, offset, "email"),
        relatedType: "check_in_cycle",
        relatedId: cycle.id,
      });
      if (notice.status === "queued" || notice.status === "sent") {
        const already = cycle.events.some(
          (event) => event.offsetDays === offset && (event.type === "notice_sent" || event.type === "reminder_sent"),
        );
        if (!already && notice.providerMessageId) {
          await prisma.checkInEvent.create({
            data: {
              cycleId: cycle.id,
              type: offset === 0 ? "notice_sent" : "reminder_sent",
              offsetDays: offset,
              at: now,
              notificationId: notice.id,
            },
          });
          sent += 1;
        }
      }
    }
    if (offsets.some((offset) => offset > 0)) {
      await prisma.checkInCycle.update({ where: { id: cycle.id }, data: { state: "reminded" } });
    }
    const simulatedAlready = cycle.events.some((event) => event.type === "simulated_release_recorded");
    if (
      isTestMode() &&
      shouldRecordSimulatedRelease({
        dueAt: cycle.dueAt,
        now,
        alreadyRecorded: simulatedAlready,
        pausedUntil: policy.pausedUntil,
      })
    ) {
      const notice = await deliverEmail(prisma, {
        to: cycle.user.email,
        templateId: "simulated_conditional_release",
        variables: { authorName: cycle.user.profile?.displayName || "there" },
        idempotencyKey: simulatedReleaseKey(cycle.id),
        relatedType: "check_in_cycle",
        relatedId: cycle.id,
      });
      if ((notice.status === "queued" || notice.status === "sent") && !simulatedAlready && notice.providerMessageId) {
        await prisma.checkInEvent.create({
          data: {
            cycleId: cycle.id,
            type: "simulated_release_recorded",
            offsetDays: SIMULATED_RELEASE_AFTER_DAYS,
            at: now,
            notificationId: notice.id,
          },
        });
        simulatedReleasesRecorded += 1;
      }
    }
    const unreachableAlready = cycle.events.some((event) => event.type === "unreachable_notice_sent");
    if (
      shouldNotifyTrustedContacts({
        dueAt: cycle.dueAt,
        now,
        alreadySent: unreachableAlready,
        pausedUntil: policy.pausedUntil,
      })
    ) {
      const contacts = await prisma.person.findMany({
        where: {
          ownerUserId: cycle.userId,
          roles: { some: { role: "trusted_contact", revokedAt: null, channelVerifiedAt: { not: null } } },
        },
      });
      for (const contact of contacts) {
        if (!contact.email) continue;
        await deliverEmail(prisma, {
          to: contact.email,
          templateId: "trusted_contact_unreachable",
          variables: { authorName: cycle.user.profile?.displayName || "The author" },
          idempotencyKey: unreachableNoticeKey(cycle.id, contact.id),
          relatedType: "check_in_cycle",
          relatedId: cycle.id,
        });
      }
      await prisma.checkInEvent.create({
        data: { cycleId: cycle.id, type: "unreachable_notice_sent", offsetDays: UNREACHABLE_AFTER_DAYS, at: now },
      });
      await prisma.checkInCycle.update({ where: { id: cycle.id }, data: { state: "missed_unreachable" } });
    }
  }
  return { remindersSent: sent, simulatedReleasesRecorded };
}

export async function advanceVerificationWindows(prisma: PrismaClient, now: Date) {
  const cases = await prisma.verificationCase.findMany({
    where: { state: { in: ["cooling_off", "cancellation_window"] } },
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

export function overdueLabel(dueAt: Date, now: Date): { overdue: boolean; daysOverdue: number } {
  const days = daysOverdue(dueAt, now);
  return { overdue: now.getTime() >= dueAt.getTime(), daysOverdue: days };
}
