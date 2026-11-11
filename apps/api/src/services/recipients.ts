import type { Prisma, PrismaClient } from "@digi/db";

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
  await tx.itemGrant.updateMany({
    where: { personId, revokedAt: null },
    data: { revokedAt: now },
  });
  await tx.releaseJob.updateMany({
    where: { personId, status: { in: ["pending", "failed", "sending"] } },
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
      where: { capsuleItemId: itemId, status: { in: ["pending", "failed", "sending"] } },
      data: { status: "cancelled", cancelledAt: now },
    });
    if (sent === 0) {
      await tx.capsuleItem.updateMany({
        where: { id: itemId, status: "scheduled" },
        data: { status: "draft" },
      });
    }
  }
}
