import type { Prisma, PrismaClient } from "@digi/db";

type Writer = PrismaClient | Prisma.TransactionClient;

export function audit(
  prisma: Writer,
  input: { actorUserId?: string | null; action: string; entityType: string; entityId: string; metadata?: Prisma.InputJsonValue },
) {
  return prisma.auditEvent.create({
    data: {
      actorUserId: input.actorUserId ?? null,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      metadata: input.metadata,
      at: new Date(),
    },
  });
}
