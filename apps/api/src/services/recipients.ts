import type { Prisma, PrismaClient } from "@digi/db";
import { revokeMediaShares } from "./media-shares";

type Tx = PrismaClient | Prisma.TransactionClient;

export async function userIdForEmail(tx: Tx, email: string) {
  const user = await tx.user.findUnique({ where: { email }, select: { id: true } });
  return user?.id ?? null;
}

/**
 * Stops future deliveries to one contact. Memories and already-sent jobs stay.
 * A scheduled memory with nobody left to receive it returns to draft.
 */
export async function cancelFutureDeliveriesForPerson(tx: Tx, personId: string, now: Date) {
  const touched = await tx.itemGrant.findMany({
    where: { personId },
    select: { capsuleItemId: true },
  });
  await revokeMediaShares(tx, { personId }, now);
  await tx.itemGrant.updateMany({
    where: { personId, revokedAt: null },
    data: { revokedAt: now },
  });
  await tx.releaseJob.updateMany({
    where: { personId, status: { in: ["pending", "failed", "sending", "processing", "uncertain"] } },
    data: { status: "cancelled", cancelledAt: now },
  });
  const itemIds = [...new Set(touched.map((row) => row.capsuleItemId))];
  for (const itemId of itemIds) {
    const remaining = await tx.itemGrant.count({ where: { capsuleItemId: itemId, revokedAt: null } });
    if (remaining > 0) continue;
    const sent = await tx.releaseJob.count({ where: { capsuleItemId: itemId, status: "sent" } });
    await tx.releaseRule.updateMany({
      where: { capsuleItemId: itemId, status: { in: ["active", "paused"] } },
      data: { status: "cancelled", cancelledAt: now, nextRunAt: null },
    });
    await tx.releaseJob.updateMany({
      where: { capsuleItemId: itemId, status: { in: ["pending", "failed", "sending", "processing", "uncertain"] } },
      data: { status: "cancelled", cancelledAt: now },
    });
    await tx.capsuleItem.update({
      where: { id: itemId },
      data: {
        scheduleGeneration: { increment: 1 },
        ...(sent === 0 ? { status: "draft" as const } : {}),
      },
    });
  }
}
