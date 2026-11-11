import type { Prisma, PrismaClient } from "@digi/db";
import { CHECK_IN_INTERVAL_DAYS, REMINDER_OFFSETS_DAYS, UNREACHABLE_AFTER_DAYS } from "@digi/shared";
import { nextDueAt, verificationReducer, type VerificationState } from "@digi/domain";
import { audit } from "../lib/audit";
import { currentInstant } from "../lib/clock";

type Writer = PrismaClient | Prisma.TransactionClient;

export async function provisionAuthor(
  prisma: Writer,
  input: { userId: string; displayName: string; timeZone: string; now: Date },
) {
  const due = nextDueAt(input.now, CHECK_IN_INTERVAL_DAYS);
  await prisma.profile.create({
    data: { userId: input.userId, displayName: input.displayName, timeZone: input.timeZone },
  });
  await prisma.consentRecord.createMany({
    data: [
      { userId: input.userId, purpose: "terms", policyVersion: "2026-11-10", grantedAt: input.now, source: "signup" },
      { userId: input.userId, purpose: "privacy", policyVersion: "2026-11-10", grantedAt: input.now, source: "signup" },
    ],
  });
  await prisma.checkInPolicy.create({
    data: {
      userId: input.userId,
      intervalDays: CHECK_IN_INTERVAL_DAYS,
      nextDueAt: due,
      nextCheckAt: due,
      accountCheckStatus: "on_time",
      escalationStatus: "none",
      reminderOffsets: [...REMINDER_OFFSETS_DAYS],
      unreachableAfterDays: UNREACHABLE_AFTER_DAYS,
    },
  });
  await prisma.checkInCycle.create({
    data: { userId: input.userId, dueAt: due, state: "due" },
  });
  await prisma.capsule.create({
    data: { ownerUserId: input.userId, title: "My memories", status: "active" },
  });
}

const TERMINAL = ["recovered", "cancelled", "released"] as const;

export async function recoverOpenReview(prisma: Writer, userId: string, at: Date) {
  const open = await prisma.verificationCase.findFirst({
    where: { subjectUserId: userId, state: { notIn: [...TERMINAL] } },
  });
  if (!open) return { recovered: false, cancelledJobIds: [] as string[] };
  const pending = await prisma.releaseJob.findMany({
    where: { verificationCaseId: open.id, status: { in: ["pending", "sending", "failed"] } },
  });
  const result = verificationReducer(open.state as VerificationState, {
    type: "author_authenticated",
    pendingJobIds: pending.map((job) => job.id),
  });
  await prisma.verificationCase.update({
    where: { id: open.id },
    data: { state: "recovered", resolution: "recovered", resolvedAt: at },
  });
  if (result.cancelJobIds.length > 0) {
    await prisma.releaseJob.updateMany({
      where: { id: { in: result.cancelJobIds }, status: { not: "sent" } },
      data: { status: "cancelled", cancelledAt: at },
    });
  }
  await audit(prisma, {
    actorUserId: userId,
    action: "verification.recovered",
    entityType: "verification_case",
    entityId: open.id,
    metadata: { cancelledJobIds: result.cancelJobIds },
  });
  return { recovered: true, cancelledJobIds: result.cancelJobIds };
}

function confirmedPolicy(due: Date, at: Date, escalationStatus: string) {
  return {
    nextDueAt: due,
    nextCheckAt: due,
    lastConfirmedAt: at,
    confirmationRequestedAt: null,
    confirmationDeadline: null,
    accountCheckStatus: "on_time" as const,
    escalationStatus: escalationStatus === "pending" ? "cancelled" as const : "none" as const,
  };
}

async function applyConfirmation(
  tx: Writer,
  input: { userId: string; at: Date; method: "session" | "email_link" },
) {
  await tx.$executeRaw`SELECT user_id FROM check_in_policies WHERE user_id = ${input.userId}::uuid FOR UPDATE`;
  const policy = await tx.checkInPolicy.findUniqueOrThrow({ where: { userId: input.userId } });
  const cycle = await tx.checkInCycle.findFirst({
    where: { userId: input.userId, state: { in: ["due", "reminded", "missed_unreachable"] } },
    orderBy: { dueAt: "desc" },
  });
  if (!cycle) throw new Error("NO_OPEN_CYCLE");
  const due = nextDueAt(input.at, policy.intervalDays);
  const escalationCancelled = policy.escalationStatus === "pending";
  if (cycle.dueAt.getTime() === due.getTime()) {
    await tx.checkInEvent.create({ data: { cycleId: cycle.id, type: "confirmed", at: input.at } });
  } else {
    await tx.checkInCycle.update({
      where: { id: cycle.id },
      data: { state: "confirmed", confirmedAt: input.at, confirmationMethod: input.method },
    });
    await tx.checkInEvent.create({ data: { cycleId: cycle.id, type: "confirmed", at: input.at } });
    await tx.checkInCycle.create({ data: { userId: input.userId, dueAt: due, state: "due" } });
  }
  await tx.checkInPolicy.update({
    where: { userId: input.userId },
    data: { ...confirmedPolicy(due, input.at, policy.escalationStatus), warningGeneration: { increment: 1 } },
  });
  const cancelledWarnings = await tx.notificationDelivery.updateMany({
    where: {
      userId: input.userId,
      status: { in: ["queued", "pending", "processing", "failed"] },
      templateId: { in: ["check_in_due", "check_in_reminder", "check_in_window_final", "check_in_escalation"] },
    },
    data: { status: "cancelled", cancelledAt: input.at, errorCode: "checked_in" },
  });
  await tx.checkInConfirmationToken.deleteMany({ where: { userId: input.userId, usedAt: null } });
  const result = await recoverOpenReview(tx, input.userId, input.at);
  await audit(tx, {
    actorUserId: input.userId,
    action: "check_in.confirmed",
    entityType: "check_in_cycle",
    entityId: cycle.id,
    metadata: { method: input.method, escalationCancelled, warningsCancelled: cancelledWarnings.count, sameInstant: cycle.dueAt.getTime() === due.getTime() },
  });
  await audit(tx, {
    actorUserId: input.userId,
    action: "check_in.warnings_cancelled",
    entityType: "check_in_policy",
    entityId: input.userId,
    metadata: { warningsCancelled: cancelledWarnings.count, generation: policy.warningGeneration + 1 },
  });
  if (escalationCancelled) {
    await audit(tx, {
      actorUserId: input.userId,
      action: "check_in.escalation_cancelled",
      entityType: "check_in_policy",
      entityId: input.userId,
      metadata: { method: input.method },
    });
  }
  return { confirmedAt: input.at, nextDueAt: due, reviewStopped: result.recovered, escalationCancelled };
}

export async function confirmAlive(prisma: PrismaClient, userId: string, method: "session" | "email_link" = "session") {
  const at = await currentInstant(prisma);
  return prisma.$transaction((tx) => applyConfirmation(tx, { userId, at, method }));
}

export async function confirmAliveFromToken(prisma: PrismaClient, tokenHash: string) {
  const at = await currentInstant(prisma);
  const row = await prisma.checkInConfirmationToken.findUnique({ where: { tokenHash } });
  if (!row || row.usedAt) throw new Error("TOKEN_INVALID");
  if (row.expiresAt.getTime() <= at.getTime()) throw new Error("TOKEN_EXPIRED");
  return prisma.$transaction(async (tx) => {
    const claimed = await tx.checkInConfirmationToken.updateMany({
      where: { id: row.id, usedAt: null, expiresAt: { gt: at } },
      data: { usedAt: at },
    });
    if (claimed.count !== 1) throw new Error("TOKEN_INVALID");
    return applyConfirmation(tx, { userId: row.userId, at, method: "email_link" });
  });
}
