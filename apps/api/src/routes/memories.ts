import type { FastifyInstance } from "fastify";
import type { CapsuleItem, ItemGrant, Person, ReleaseJob, ReleaseRule } from "@prisma/client";
import { exactInstant, assertFutureInstant } from "@digi/domain";
import { z } from "zod";
import { requireUser } from "../auth";
import { AppError, fromZod } from "../errors";
import { audit } from "../lib/audit";
import { currentInstant } from "../lib/clock";
import { decryptText, encryptText } from "../lib/crypto";

type ItemGraph = CapsuleItem & {
  releaseRules: ReleaseRule[];
  grants: (ItemGrant & { person: Person })[];
  releaseJobs: ReleaseJob[];
  media: { position: number; asset: { id: string; mimeType: string; byteSize: number; originalName: string; deletedAt: Date | null } }[];
};

function activeRule(item: { releaseRules: ReleaseRule[] }) {
  return item.releaseRules.find((rule) => rule.status === "active" || rule.status === "paused") ?? null;
}

function deliveryMode(item: ItemGraph) {
  const rule = activeRule(item);
  if (rule?.trigger === "after_verification") return "if_i_am_gone";
  if (rule?.trigger === "exact_time") return "on_date";
  if (item.status === "released") return "released";
  return "unscheduled";
}

function presentMemory(item: ItemGraph) {
  const rule = activeRule(item);
  const body =
    item.bodyCiphertext && item.bodyNonce && item.bodyTag
      ? decryptText(Buffer.from(item.bodyCiphertext), Buffer.from(item.bodyNonce), Buffer.from(item.bodyTag))
      : "";
  const sent = item.releaseJobs.filter((job) => job.status === "sent").length;
  const failed = item.releaseJobs.some((job) => job.status === "failed" || job.status === "dead");
  return {
    id: item.id,
    title: item.title,
    body,
    status: item.status,
    deliveryMode: deliveryMode(item),
    schedule: rule
      ? {
          trigger: rule.trigger,
          localDate: rule.localDate,
          localTime: rule.localTime,
          timeZone: rule.timeZone,
          nextRunAt: rule.nextRunAt,
          status: rule.status,
        }
      : null,
    recipients: item.grants
      .filter((grant) => !grant.revokedAt)
      .map((grant) => ({
        id: grant.person.id,
        displayName: grant.person.displayName,
        email: grant.person.email,
      })),
    attachments: item.media
      .filter((link) => !link.asset.deletedAt)
      .sort((a, b) => a.position - b.position)
      .map((link) => ({
        id: link.asset.id,
        mimeType: link.asset.mimeType,
        byteSize: link.asset.byteSize,
        originalName: link.asset.originalName,
        kind: link.asset.mimeType.startsWith("video/") ? "video" : "photo",
      })),
    delivery: {
      sent,
      failed,
      pending: item.releaseJobs.some((job) => job.status === "pending" || job.status === "sending"),
    },
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    releasedAt: item.releasedAt,
  };
}

const include = {
  releaseRules: true,
  releaseJobs: true,
  grants: { include: { person: true } },
  media: { include: { asset: true } },
} as const;

async function ownedMemory(app: FastifyInstance, userId: string, id: string) {
  const item = await app.prisma.capsuleItem.findFirst({
    where: { id, status: { not: "cancelled" }, capsule: { ownerUserId: userId } },
    include,
  });
  if (!item) throw new AppError(404, "NOT_FOUND", "Memory not found.");
  return item;
}

export async function memoryRoutes(app: FastifyInstance) {
  app.get("/memories", async (request) => {
    const user = await requireUser(request);
    const items = await app.prisma.capsuleItem.findMany({
      where: { status: { not: "cancelled" }, capsule: { ownerUserId: user.id } },
      include,
      orderBy: { updatedAt: "desc" },
    });
    return { memories: items.map(presentMemory) };
  });

  app.post("/memories", async (request, reply) => {
    const user = await requireUser(request);
    const parsed = z
      .object({
        title: z.string().trim().min(1, "Add a title.").max(160, "Title is too long."),
        body: z.string().max(100_000, "Letter is too long.").optional(),
      })
      .safeParse(request.body);
    if (!parsed.success) throw fromZod(parsed.error);
    const capsule = await app.prisma.capsule.findFirst({ where: { ownerUserId: user.id, status: { not: "archived" } } });
    if (!capsule) throw new AppError(500, "NO_CAPSULE", "Your memory library is missing.");
    const encrypted = parsed.data.body ? encryptText(parsed.data.body) : null;
    const item = await app.prisma.capsuleItem.create({
      data: {
        capsuleId: capsule.id,
        title: parsed.data.title,
        kind: "letter",
        status: "draft",
        bodyCiphertext: encrypted?.ciphertext,
        bodyNonce: encrypted?.nonce,
        bodyTag: encrypted?.tag,
      },
      include,
    });
    await audit(app.prisma, { actorUserId: user.id, action: "memory.created", entityType: "capsule_item", entityId: item.id });
    return reply.code(201).send({ memory: presentMemory(item) });
  });

  app.get("/memories/:id", async (request) => {
    const user = await requireUser(request);
    const { id } = request.params as { id: string };
    return { memory: presentMemory(await ownedMemory(app, user.id, id)) };
  });

  app.patch("/memories/:id", async (request) => {
    const user = await requireUser(request);
    const { id } = request.params as { id: string };
    const item = await ownedMemory(app, user.id, id);
    if (item.status === "released" || item.releaseJobs.some((job) => job.status === "sent")) {
      throw new AppError(409, "ALREADY_DELIVERED", "This memory has already been delivered and can no longer be edited.");
    }
    const parsed = z
      .object({
        title: z.string().trim().min(1, "Add a title.").max(160).optional(),
        body: z.string().max(100_000).optional(),
      })
      .safeParse(request.body);
    if (!parsed.success) throw fromZod(parsed.error);
    const encrypted = parsed.data.body !== undefined ? encryptText(parsed.data.body) : null;
    const updated = await app.prisma.capsuleItem.update({
      where: { id: item.id },
      data: {
        title: parsed.data.title,
        bodyCiphertext: encrypted?.ciphertext,
        bodyNonce: encrypted?.nonce,
        bodyTag: encrypted?.tag,
      },
      include,
    });
    return { memory: presentMemory(updated) };
  });

  app.post("/memories/:id/schedule", async (request) => {
    const user = await requireUser(request);
    if (!user.emailVerifiedAt) {
      throw new AppError(403, "EMAIL_NOT_VERIFIED", "Verify your email before scheduling a memory.");
    }
    const { id } = request.params as { id: string };
    const item = await ownedMemory(app, user.id, id);
    if (item.releaseJobs.some((job) => job.status === "sent")) {
      throw new AppError(409, "ALREADY_DELIVERED", "This memory has already been delivered.");
    }
    const parsed = z
      .object({
        mode: z.enum(["on_date", "if_i_am_gone"]),
        localDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a valid date.").optional(),
        localTime: z.string().regex(/^\d{2}:\d{2}$/, "Choose a valid time.").optional(),
        timeZone: z.string().min(1).optional(),
        recipientIds: z.array(z.string().uuid("Choose a recipient.")).min(1, "Choose at least one recipient."),
      })
      .safeParse(request.body);
    if (!parsed.success) throw fromZod(parsed.error);
    const body = parsed.data;
    const people = await app.prisma.person.findMany({
      where: { id: { in: body.recipientIds }, ownerUserId: user.id },
      include: { roles: true },
    });
    if (people.length !== new Set(body.recipientIds).size) {
      throw new AppError(404, "NOT_FOUND", "One of the selected recipients was not found.");
    }
    for (const person of people) {
      const role = person.roles.find((entry) => entry.role === "recipient" && !entry.revokedAt);
      if (!role?.channelVerifiedAt) {
        throw new AppError(400, "RECIPIENT_NOT_VERIFIED", `${person.displayName} needs a verified email before they can receive a memory.`);
      }
    }
    const now = await currentInstant(app.prisma);
    let nextRunAt: Date | null = null;
    let timeZone = body.timeZone || user.timeZone;
    if (body.mode === "on_date") {
      if (!body.localDate || !body.localTime) {
        throw new AppError(400, "VALIDATION_ERROR", "Choose a delivery date and time.");
      }
      try {
        Intl.DateTimeFormat("en-US", { timeZone });
        nextRunAt = exactInstant(body.localDate, body.localTime, timeZone);
        assertFutureInstant(nextRunAt, now);
      } catch (error) {
        const message = error instanceof Error && error.message === "DELIVERY_MUST_BE_IN_THE_FUTURE"
          ? "Choose a delivery time in the future."
          : "Choose a valid date, time, and time zone.";
        throw new AppError(400, "VALIDATION_ERROR", message);
      }
    }
    const updated = await app.prisma.$transaction(async (tx) => {
      await tx.itemGrant.updateMany({
        where: { capsuleItemId: item.id, revokedAt: null },
        data: { revokedAt: now },
      });
      await tx.itemGrant.createMany({
        data: body.recipientIds.map((personId) => ({ capsuleItemId: item.id, personId, visibility: "released_only" as const })),
      });
      await tx.releaseRule.updateMany({
        where: { capsuleItemId: item.id, status: { in: ["active", "paused"] } },
        data: { status: "cancelled", cancelledAt: now },
      });
      await tx.releaseJob.updateMany({
        where: { capsuleItemId: item.id, status: { in: ["pending", "failed", "sending"] } },
        data: { status: "cancelled", cancelledAt: now },
      });
      await tx.releaseRule.create({
        data: {
          capsuleItemId: item.id,
          trigger: body.mode === "on_date" ? "exact_time" : "after_verification",
          timeZone,
          localDate: body.mode === "on_date" ? body.localDate : null,
          localTime: body.mode === "on_date" ? body.localTime : null,
          nextRunAt,
          status: "active",
        },
      });
      const saved = await tx.capsuleItem.update({
        where: { id: item.id },
        data: { status: "scheduled" },
        include,
      });
      await audit(tx, {
        actorUserId: user.id,
        action: "memory.scheduled",
        entityType: "capsule_item",
        entityId: item.id,
        metadata: { mode: body.mode, recipientCount: body.recipientIds.length },
      });
      return saved;
    });
    return { memory: presentMemory(updated) };
  });

  app.post("/memories/:id/cancel", async (request) => {
    const user = await requireUser(request);
    const { id } = request.params as { id: string };
    const item = await ownedMemory(app, user.id, id);
    if (item.releaseJobs.some((job) => job.status === "sent")) {
      throw new AppError(409, "ALREADY_DELIVERED", "A delivery that was already sent cannot be cancelled.");
    }
    const now = await currentInstant(app.prisma);
    const updated = await app.prisma.$transaction(async (tx) => {
      await tx.releaseRule.updateMany({
        where: { capsuleItemId: item.id, status: { in: ["active", "paused"] } },
        data: { status: "cancelled", cancelledAt: now },
      });
      await tx.releaseJob.updateMany({
        where: { capsuleItemId: item.id, status: { not: "sent" } },
        data: { status: "cancelled", cancelledAt: now },
      });
      return tx.capsuleItem.update({ where: { id: item.id }, data: { status: "draft" }, include });
    });
    return { memory: presentMemory(updated) };
  });

  app.delete("/memories/:id", async (request, reply) => {
    const user = await requireUser(request);
    const { id } = request.params as { id: string };
    const item = await ownedMemory(app, user.id, id);
    if (item.releaseJobs.some((job) => job.status === "sent")) {
      throw new AppError(409, "ALREADY_DELIVERED", "A delivered memory cannot be deleted from this screen.");
    }
    const now = await currentInstant(app.prisma);
    await app.prisma.$transaction(async (tx) => {
      await tx.releaseRule.updateMany({
        where: { capsuleItemId: item.id, status: { in: ["active", "paused"] } },
        data: { status: "cancelled", cancelledAt: now },
      });
      await tx.releaseJob.updateMany({
        where: { capsuleItemId: item.id, status: { not: "sent" } },
        data: { status: "cancelled", cancelledAt: now },
      });
      await tx.capsuleItem.update({ where: { id: item.id }, data: { status: "cancelled" } });
      await audit(tx, { actorUserId: user.id, action: "memory.cancelled", entityType: "capsule_item", entityId: item.id });
    });
    for (const link of item.media) {
      if (!link.asset.deletedAt) {
        await app.storage.remove(link.asset.storageKey).catch(() => undefined);
        await app.prisma.mediaAsset.update({ where: { id: link.asset.id }, data: { status: "deleted", deletedAt: now } });
      }
    }
    return reply.code(204).send();
  });
}
