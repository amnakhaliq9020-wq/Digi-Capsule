import type { FastifyInstance } from "fastify";
import { Prisma, type CapsuleItem, type ItemGrant, type Person, type ReleaseJob, type ReleaseRule } from "@prisma/client";
import { exactInstant, assertFutureInstant, earliestDelivery, DEFAULT_DELIVERY_LOCAL_TIME } from "@digi/domain";
import { z } from "zod";
import { requireUser } from "../auth";
import { AppError, fromZod } from "../errors";
import { recipientCanView } from "../lib/access";
import { audit } from "../lib/audit";
import { currentInstant, usesSimulationClock } from "../lib/clock";
import { decryptText, encryptText } from "../lib/crypto";
import { revokeMediaShares } from "../services/media-shares";
import { recipientTimeZones } from "../services/recipient-clock";

type ItemGraph = CapsuleItem & {
  releaseRules: ReleaseRule[];
  grants: (ItemGrant & { person: Person })[];
  releaseJobs: ReleaseJob[];
  media: { position: number; asset: { id: string; mimeType: string; byteSize: number; originalName: string; deletedAt: Date | null } }[];
};

function futureDeliveryMessage(now: Date, timeZone: string) {
  const shown = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone,
  }).format(now);
  const clock = `${shown} (${timeZone})`;
  if (usesSimulationClock() && now.getTime() > Date.now() + 2 * 60 * 1000) {
    return `Choose a delivery time after the test clock (${clock}). The test clock is ahead of the real time, so a date on the calendar can still be too early. Set the test clock to now, or pick a later date.`;
  }
  if (usesSimulationClock()) return `Choose a delivery time after the test clock (${clock}).`;
  return `Choose a delivery time after ${clock}. That time is already in the past.`;
}

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
    scheduleGeneration: item.scheduleGeneration,
    deliveryMode: deliveryMode(item),
    schedule: rule
      ? {
          trigger: rule.trigger,
          localDate: rule.localDate,
          localTime: rule.localTime,
          timeZone: rule.timeZone,
          nextRunAt: rule.nextRunAt,
          status: rule.status,
          generation: item.scheduleGeneration,
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
      pending: item.releaseJobs.some((job) => job.status === "pending" || job.status === "sending" || job.status === "processing" || job.status === "uncertain"),
    },
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    releasedAt: item.releasedAt,
  };
}

const include = {
  capsule: { select: { ownerUserId: true } },
  releaseRules: true,
  releaseJobs: true,
  grants: { include: { person: true } },
  media: { include: { asset: true } },
} as const;

function datedRule(item: ItemGraph) {
  const active = activeRule(item);
  if (active?.trigger === "exact_time") return active;
  if (active) return null;
  return item.releaseRules
    .filter((rule) => rule.trigger === "exact_time" && rule.localDate && rule.localTime && rule.status === "completed")
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0] ?? null;
}

function decorateMemory(item: ItemGraph, zones: Map<string, string>) {
  const memory = presentMemory(item);
  const rule = datedRule(item);
  if (!rule || !rule.localDate || !rule.localTime) {
    return { ...memory, recipientDeliveries: [] as RecipientDelivery[] };
  }
  const recipientDeliveries = item.grants
    .filter((grant) => !grant.revokedAt)
    .map((grant) => {
      const timeZone = zones.get(grant.person.id) || rule.timeZone;
      let occursAt: string | null = null;
      try {
        occursAt = exactInstant(rule.localDate!, rule.localTime!, timeZone).toISOString();
      } catch {
        occursAt = null;
      }
      const job = [...item.releaseJobs].reverse().find((entry) => entry.personId === grant.person.id && entry.status !== "cancelled");
      return {
        id: grant.person.id,
        displayName: grant.person.displayName,
        email: grant.person.email,
        timeZone,
        localDate: rule.localDate,
        localTime: rule.localTime,
        occursAt,
        deliveryStatus: job?.status ?? "pending",
      };
    });
  return { ...memory, recipientDeliveries };
}

type RecipientDelivery = {
  id: string;
  displayName: string;
  email: string | null;
  timeZone: string;
  localDate: string | null;
  localTime: string | null;
  occursAt: string | null;
  deliveryStatus: string;
};

async function presentItems(prisma: FastifyInstance["prisma"], items: ItemGraph[]) {
  const ids = [...new Set(items.flatMap((item) => item.grants.map((grant) => grant.person.linkedUserId).filter((id): id is string => Boolean(id))))];
  const profiles = ids.length
    ? await prisma.profile.findMany({ where: { userId: { in: ids } }, select: { userId: true, timeZone: true } })
    : [];
  const byUser = new Map(profiles.map((profile) => [profile.userId, profile.timeZone]));
  return items.map((item) => {
    const fallback = activeRule(item)?.timeZone || "UTC";
    const zones = new Map(item.grants.map((grant) => {
      const linked = grant.person.linkedUserId ? byUser.get(grant.person.linkedUserId) : undefined;
      return [grant.person.id, linked || grant.person.timeZone || fallback] as const;
    }));
    return decorateMemory(item, zones);
  });
}

async function asMemory(prisma: FastifyInstance["prisma"], item: ItemGraph, access: "owner" | "recipient") {
  const [memory] = await presentItems(prisma, [item]);
  return { memory: { ...memory, access } };
}

function assertUuid(id: string) {
  if (!z.string().uuid().safeParse(id).success) throw new AppError(404, "NOT_FOUND", "Memory not found.");
}

async function ownedMemory(app: FastifyInstance, userId: string, id: string) {
  assertUuid(id);
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
    return { memories: await presentItems(app.prisma, items) };
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
    return reply.code(201).send(await asMemory(app.prisma, item, "owner"));
  });

  app.get("/received", async (request) => {
    const user = await requireUser(request);
    const items = await app.prisma.capsuleItem.findMany({
      where: {
        status: { in: ["released", "scheduled"] },
        grants: { some: { revokedAt: null, person: { linkedUserId: user.id } } },
      },
      include,
      orderBy: { updatedAt: "desc" },
    });
    const visible = items.filter((item) => recipientCanView(user.id, item));
    const memories = await presentItems(app.prisma, visible);
    return { memories: memories.map((memory) => ({ ...memory, access: "recipient" as const })) };
  });

  app.get("/memories/:id", async (request) => {
    const user = await requireUser(request);
    const { id } = request.params as { id: string };
    if (!z.string().uuid().safeParse(id).success) throw new AppError(404, "NOT_FOUND", "Memory not found.");
    const owned = await app.prisma.capsuleItem.findFirst({
      where: { id, status: { not: "cancelled" }, capsule: { ownerUserId: user.id } },
      include,
    });
    if (owned) return asMemory(app.prisma, owned, "owner");
    const shared = await app.prisma.capsuleItem.findFirst({
      where: { id, status: { in: ["released", "scheduled"] } },
      include,
    });
    if (shared && recipientCanView(user.id, shared)) return asMemory(app.prisma, shared, "recipient");
    throw new AppError(404, "NOT_FOUND", "Memory not found.");
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
    return asMemory(app.prisma, updated, "owner");
  });

  app.post("/memories/:id/schedule", async (request) => {
    const user = await requireUser(request);
    const { id } = request.params as { id: string };
    const item = await ownedMemory(app, user.id, id);
    if (!user.emailVerifiedAt) {
      throw new AppError(403, "EMAIL_NOT_VERIFIED", "Verify your email before scheduling a memory.");
    }
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
    const timeZone = body.timeZone || user.timeZone;
    const localTime = body.localTime || DEFAULT_DELIVERY_LOCAL_TIME;
    const requestedTrigger = body.mode === "on_date" ? "exact_time" : "after_verification";
    if (body.mode === "on_date") {
      if (!body.localDate) throw new AppError(400, "VALIDATION_ERROR", "Choose a delivery date.");
      try {
        Intl.DateTimeFormat("en-US", { timeZone });
      } catch {
        throw new AppError(400, "VALIDATION_ERROR", "Choose a valid time zone.");
      }
      const zones = await recipientTimeZones(app.prisma, people, timeZone);
      const instants: Date[] = [];
      for (const person of people) {
        const zone = zones.get(person.id) || timeZone;
        try {
          Intl.DateTimeFormat("en-US", { timeZone: zone });
          const instant = exactInstant(body.localDate, localTime, zone);
          assertFutureInstant(instant, now);
          instants.push(instant);
        } catch (error) {
          const code = error instanceof Error ? error.message : "";
          const message = code === "DELIVERY_MUST_BE_IN_THE_FUTURE"
            ? `${person.displayName}: ${futureDeliveryMessage(now, zone)}`
            : "Choose a valid date. 29 February is only available in a leap year.";
          throw new AppError(400, "VALIDATION_ERROR", message);
        }
      }
      nextRunAt = earliestDelivery(instants);
    }
    const updated = await app.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT id FROM capsule_items WHERE id = ${item.id}::uuid FOR UPDATE`;
      const fresh = await tx.capsuleItem.findUniqueOrThrow({ where: { id: item.id }, include });
      if (fresh.releaseJobs.some((job) => job.status === "sent" || job.status === "delivered")) {
        throw new AppError(409, "ALREADY_DELIVERED", "The email provider already accepted this message. It cannot be recalled.");
      }
      const active = fresh.releaseRules.find((rule) => rule.status === "active" || rule.status === "paused");
      const recipients = fresh.grants.filter((grant) => !grant.revokedAt).map((grant) => grant.personId).sort();
      const requestedRecipients = [...new Set(body.recipientIds)].sort();
      const sameRecipients = recipients.length === requestedRecipients.length && recipients.every((personId, index) => personId === requestedRecipients[index]);
      const sameSchedule = Boolean(
        active
        && active.trigger === requestedTrigger
        && sameRecipients
        && (requestedTrigger === "after_verification" || (active.localDate === body.localDate && active.localTime === localTime && active.timeZone === timeZone)),
      );
      if (sameSchedule) return { item: fresh, alreadyApplied: true, providerAccepted: false, replacing: false };
      const providerAccepted = fresh.releaseJobs.some((job) => job.status === "uncertain" || Boolean(job.providerMessageId) || Boolean(job.dispatchStartedAt));
      await tx.itemGrant.updateMany({
        where: { capsuleItemId: item.id, revokedAt: null },
        data: { revokedAt: now },
      });
      await tx.itemGrant.createMany({
        data: body.recipientIds.map((personId) => ({ capsuleItemId: item.id, personId, visibility: "released_only" as const })),
      });
      await tx.releaseRule.updateMany({
        where: { capsuleItemId: item.id, status: { in: ["active", "paused"] } },
        data: { status: "cancelled", cancelledAt: now, nextRunAt: null },
      });
      await tx.releaseJob.updateMany({
        where: { capsuleItemId: item.id, status: { in: ["pending", "failed", "sending", "processing"] }, dispatchStartedAt: null },
        data: { status: "cancelled", cancelledAt: now, lastError: "superseded", retryable: false },
      });
      const replacing = Boolean(active);
      const savedItem = await tx.capsuleItem.update({
        where: { id: item.id },
        data: {
          status: "scheduled",
          ...(replacing ? { scheduleGeneration: { increment: 1 } } : {}),
        },
      });
      await tx.releaseRule.create({
        data: {
          capsuleItemId: item.id,
          trigger: requestedTrigger,
          timeZone,
          localDate: body.mode === "on_date" ? body.localDate : null,
          localTime: body.mode === "on_date" ? localTime : null,
          nextRunAt,
          status: "active",
        },
      });
      const jobIds = fresh.releaseJobs.map((job) => job.id);
      if (jobIds.length > 0) {
        await tx.notificationDelivery.updateMany({
          where: {
            relatedType: "release_job",
            relatedId: { in: jobIds },
            status: { in: ["queued", "pending", "failed", "processing"] },
            dispatchStartedAt: null,
          },
          data: { status: "cancelled", cancelledAt: now, errorCode: "schedule_superseded", payload: Prisma.DbNull },
        });
      }
      if (replacing) await revokeMediaShares(tx, { capsuleItemId: item.id }, now);
      const saved = await tx.capsuleItem.findUniqueOrThrow({ where: { id: savedItem.id }, include });
      await audit(tx, {
        actorUserId: user.id,
        action: "memory.scheduled",
        entityType: "capsule_item",
        entityId: item.id,
        metadata: { mode: body.mode, recipientCount: body.recipientIds.length, generation: saved.scheduleGeneration },
      });
      return { item: saved, alreadyApplied: false, providerAccepted, replacing };
    });
    const presented = await asMemory(app.prisma, updated.item, "owner");
    const message = updated.alreadyApplied
      ? "This delivery is already scheduled for that date and recipient."
      : updated.providerAccepted
        ? "The delivery date was updated. A message the email provider already accepted cannot be recalled. The recipient cannot open the memory until the new delivery is sent."
        : updated.replacing
          ? "Delivery updated. The previous unsent schedule was cancelled."
          : "Delivery saved.";
    return { ...presented, alreadyApplied: updated.alreadyApplied, providerAccepted: updated.providerAccepted, recallable: false, message };
  });

  app.post("/memories/:id/cancel", async (request) => {
    const user = await requireUser(request);
    const { id } = request.params as { id: string };
    const item = await ownedMemory(app, user.id, id);
    const now = await currentInstant(app.prisma);
    const updated = await app.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT id FROM capsule_items WHERE id = ${item.id}::uuid FOR UPDATE`;
      const fresh = await tx.capsuleItem.findUniqueOrThrow({ where: { id: item.id }, include });
      if (fresh.releaseJobs.some((job) => job.status === "sent" || job.status === "delivered")) {
        return { blocked: true as const, item: fresh, alreadyApplied: false, acceptanceUncertain: false };
      }
      const active = fresh.releaseRules.some((rule) => rule.status === "active" || rule.status === "paused");
      const open = fresh.releaseJobs.some((job) => ["pending", "failed", "sending", "processing", "uncertain"].includes(job.status));
      if (!active && !open && fresh.status === "draft") {
        return { blocked: false as const, item: fresh, alreadyApplied: true, acceptanceUncertain: false };
      }
      const acceptanceUncertain = fresh.releaseJobs.some((job) => job.status === "uncertain" || Boolean(job.providerMessageId) || Boolean(job.dispatchStartedAt));
      await tx.releaseRule.updateMany({
        where: { capsuleItemId: item.id, status: { in: ["active", "paused"] } },
        data: { status: "cancelled", cancelledAt: now, nextRunAt: null },
      });
      await tx.releaseJob.updateMany({
        where: { capsuleItemId: item.id, status: { in: ["pending", "failed", "sending", "processing"] }, dispatchStartedAt: null },
        data: { status: "cancelled", cancelledAt: now, lastError: "superseded", retryable: false },
      });
      await tx.itemGrant.updateMany({
        where: { capsuleItemId: item.id, revokedAt: null },
        data: { revokedAt: now },
      });
      const jobIds = fresh.releaseJobs.map((job) => job.id);
      if (jobIds.length > 0) {
        await tx.notificationDelivery.updateMany({
          where: {
            relatedType: "release_job",
            relatedId: { in: jobIds },
            status: { in: ["queued", "pending", "failed", "processing"] },
            dispatchStartedAt: null,
          },
          data: { status: "cancelled", cancelledAt: now, errorCode: "schedule_superseded", payload: Prisma.DbNull },
        });
      }
      const assetIds = fresh.media.map((link) => link.asset.id);
      if (assetIds.length > 0) await tx.mediaAccessToken.deleteMany({ where: { assetId: { in: assetIds } } });
      await revokeMediaShares(tx, { capsuleItemId: item.id }, now);
      const saved = await tx.capsuleItem.update({
        where: { id: item.id },
        data: { status: "draft", scheduleGeneration: { increment: 1 } },
        include,
      });
      await audit(tx, {
        actorUserId: user.id,
        action: "memory.delivery_cancelled",
        entityType: "capsule_item",
        entityId: item.id,
        metadata: { generation: saved.scheduleGeneration },
      });
      return { blocked: false as const, item: saved, alreadyApplied: false, acceptanceUncertain };
    });
    if (updated.blocked) {
      throw new AppError(409, "ALREADY_DELIVERED", "The email provider already accepted this message. It cannot be recalled, and the recipient can still open the memory.");
    }
    const presented = await asMemory(app.prisma, updated.item, "owner");
    const message = updated.alreadyApplied
      ? "This delivery is already cancelled. The memory is still in your capsule."
      : updated.acceptanceUncertain
        ? "The delivery is cancelled and the recipient cannot open the memory. A message the email provider already accepted, or may have accepted, cannot be recalled."
        : "Delivery cancelled. The memory is still in your capsule. Nothing was sent.";
    return { ...presented, alreadyApplied: updated.alreadyApplied, providerAccepted: updated.acceptanceUncertain, recallable: false, message };
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
        data: { status: "cancelled", cancelledAt: now, nextRunAt: null },
      });
      await tx.releaseJob.updateMany({
        where: { capsuleItemId: item.id, status: { not: "sent" } },
        data: { status: "cancelled", cancelledAt: now },
      });
      await revokeMediaShares(tx, { capsuleItemId: item.id }, now);
      await tx.capsuleItem.update({ where: { id: item.id }, data: { status: "cancelled", scheduleGeneration: { increment: 1 } } });
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
