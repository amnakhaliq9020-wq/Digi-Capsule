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
      { userId: input.userId, purpose: "terms", policyVersion: "2026-11-05", grantedAt: input.now, source: "signup" },
      { userId: input.userId, purpose: "privacy", policyVersion: "2026-11-05", grantedAt: input.now, source: "signup" },
    ],
  });
  await prisma.checkInPolicy.create({
    data: {
      userId: input.userId,
      intervalDays: CHECK_IN_INTERVAL_DAYS,
      nextDueAt: due,
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

export async function confirmAlive(prisma: PrismaClient, userId: string) {
  const at = await currentInstant(prisma);
  const policy = await prisma.checkInPolicy.findUniqueOrThrow({ where: { userId } });
  const cycle = await prisma.checkInCycle.findFirst({
    where: { userId, state: { in: ["due", "reminded", "missed_unreachable"] } },
    orderBy: { dueAt: "desc" },
  });
  if (!cycle) {
    throw new Error("NO_OPEN_CYCLE");
  }
  const due = nextDueAt(at, policy.intervalDays);
  const recovery = await prisma.$transaction(async (tx) => {
    await tx.checkInCycle.update({
      where: { id: cycle.id },
      data: { state: "confirmed", confirmedAt: at, confirmationMethod: "session" },
    });
    await tx.checkInEvent.create({
      data: { cycleId: cycle.id, type: "confirmed", at },
    });
    await tx.checkInPolicy.update({ where: { userId }, data: { nextDueAt: due } });
    await tx.checkInCycle.create({ data: { userId, dueAt: due, state: "due" } });
    const result = await recoverOpenReview(tx, userId, at);
    await audit(tx, {
      actorUserId: userId,
      action: "check_in.confirmed",
      entityType: "check_in_cycle",
      entityId: cycle.id,
      metadata: { method: "session" },
    });
    return result;
  });
  return { confirmedAt: at, nextDueAt: due, reviewStopped: recovery.recovered };
}
