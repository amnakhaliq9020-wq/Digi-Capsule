import type { Prisma, PrismaClient } from "@digi/db";
import { env } from "../env";
import { AppError } from "../errors";
import { recipientCanView } from "../lib/access";
import { audit } from "../lib/audit";
import { randomToken, sha256 } from "../lib/crypto";

const DAY_MS = 24 * 60 * 60 * 1000;
const SHARE_RETENTION_MS = 30 * DAY_MS;
export const SHARE_EXPIRY_HOURS = [1, 24, 72, 168] as const;

type Writer = PrismaClient | Prisma.TransactionClient;

export async function revokeMediaShares(
  tx: Writer,
  where: { capsuleItemId?: string; mediaAssetId?: string; personId?: string; id?: string },
  now: Date,
) {
  await tx.mediaShareLink.updateMany({
    where: { ...where, revokedAt: null },
    data: { revokedAt: now, status: "revoked" },
  });
}

export async function purgeExpiredShareLinks(prisma: PrismaClient, now: Date) {
  const cutoff = new Date(now.getTime() - SHARE_RETENTION_MS);
  await prisma.mediaShareLink.deleteMany({
    where: {
      OR: [
        { revokedAt: { lt: cutoff } },
        { expiresAt: { lt: cutoff } },
      ],
    },
  });
}

function shareState(row: { revokedAt: Date | null; expiresAt: Date }, now: Date) {
  if (row.revokedAt) return "revoked" as const;
  if (row.expiresAt.getTime() <= now.getTime()) return "expired" as const;
  return "active" as const;
}

async function recipientZone(prisma: Writer, userId: string, personZone: string | null) {
  const profile = await prisma.profile.findUnique({ where: { userId }, select: { timeZone: true } });
  return profile?.timeZone || personZone || "UTC";
}

export async function createMediaShare(
  prisma: PrismaClient,
  input: { ownerUserId: string; itemId: string; assetId: string; personId: string; expiresInHours: number; now: Date },
) {
  if (!SHARE_EXPIRY_HOURS.includes(input.expiresInHours as (typeof SHARE_EXPIRY_HOURS)[number])) {
    throw new AppError(400, "VALIDATION_ERROR", "Choose a link lifetime of 1 hour, 24 hours, 3 days, or 7 days.");
  }
  const item = await prisma.capsuleItem.findFirst({
    where: { id: input.itemId, status: { not: "cancelled" }, capsule: { ownerUserId: input.ownerUserId } },
    include: {
      media: { include: { asset: true } },
      grants: { include: { person: true } },
    },
  });
  if (!item) throw new AppError(404, "NOT_FOUND", "Memory not found.");
  const link = item.media.find((entry) => entry.mediaAssetId === input.assetId && !entry.asset.deletedAt && entry.asset.status === "ready");
  if (!link) throw new AppError(404, "NOT_FOUND", "File not found.");
  const grant = item.grants.find((entry) => entry.personId === input.personId && !entry.revokedAt);
  if (!grant || grant.person.ownerUserId !== input.ownerUserId) throw new AppError(404, "NOT_FOUND", "Recipient not found.");
  if (!grant.person.linkedUserId) {
    throw new AppError(400, "RECIPIENT_ACCOUNT_REQUIRED", "This recipient needs their own Digi Capsule account before a private link can be created.");
  }
  const token = randomToken(32);
  const expiresAt = new Date(input.now.getTime() + input.expiresInHours * 60 * 60 * 1000);
  const saved = await prisma.$transaction(async (tx) => {
    await revokeMediaShares(tx, { capsuleItemId: item.id, mediaAssetId: link.asset.id, personId: grant.personId }, input.now);
    return tx.mediaShareLink.create({
      data: {
        tokenHash: sha256(token),
        ownerUserId: input.ownerUserId,
        recipientUserId: grant.person.linkedUserId!,
        personId: grant.personId,
        capsuleItemId: item.id,
        mediaAssetId: link.asset.id,
        expiresAt,
        status: "active",
      },
      include: { person: true },
    });
  });
  await audit(prisma, {
    actorUserId: input.ownerUserId,
    action: "media.share_created",
    entityType: "media_share_link",
    entityId: saved.id,
    metadata: { memoryId: item.id, assetId: link.asset.id, recipientId: grant.personId, expiresAt: expiresAt.toISOString() },
  });
  return {
    id: saved.id,
    status: "active" as const,
    expiresAt: saved.expiresAt.toISOString(),
    recipientTimeZone: await recipientZone(prisma, saved.recipientUserId, saved.person.timeZone),
    recipient: { id: saved.person.id, displayName: saved.person.displayName },
    file: { id: link.asset.id, originalName: link.asset.originalName, mimeType: link.asset.mimeType },
    url: `${env.WEB_ORIGIN}/share#${token}`,
  };
}

export async function listMediaShares(prisma: PrismaClient, ownerUserId: string, itemId: string, now: Date) {
  const item = await prisma.capsuleItem.findFirst({
    where: { id: itemId, capsule: { ownerUserId } },
    select: { id: true },
  });
  if (!item) throw new AppError(404, "NOT_FOUND", "Memory not found.");
  const rows = await prisma.mediaShareLink.findMany({
    where: { capsuleItemId: itemId, ownerUserId },
    include: { person: true, asset: true },
    orderBy: { createdAt: "desc" },
  });
  const shares = [];
  for (const row of rows) {
    const status = shareState(row, now);
    if (status === "expired" && row.status !== "expired") {
      await prisma.mediaShareLink.update({ where: { id: row.id }, data: { status: "expired" } });
    }
    shares.push({
      id: row.id,
      status,
      expiresAt: row.expiresAt.toISOString(),
      revokedAt: row.revokedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      lastAccessAt: row.lastAccessAt?.toISOString() ?? null,
      recipientTimeZone: await recipientZone(prisma, row.recipientUserId, row.person.timeZone),
      recipient: { id: row.person.id, displayName: row.person.displayName },
      file: { id: row.asset.id, originalName: row.asset.originalName },
    });
  }
  return shares;
}

export async function revokeMediaShare(prisma: PrismaClient, ownerUserId: string, shareId: string, now: Date) {
  const row = await prisma.mediaShareLink.findFirst({ where: { id: shareId, ownerUserId } });
  if (!row) throw new AppError(404, "NOT_FOUND", "Link not found.");
  if (!row.revokedAt) await revokeMediaShares(prisma, { id: row.id }, now);
  await audit(prisma, {
    actorUserId: ownerUserId,
    action: "media.share_revoked",
    entityType: "media_share_link",
    entityId: row.id,
  });
  return { id: row.id, status: "revoked" as const };
}

export async function refreshMediaShare(prisma: PrismaClient, recipientUserId: string, itemId: string, assetId: string, now: Date) {
  const item = await prisma.capsuleItem.findFirst({
    where: { id: itemId, status: { in: ["scheduled", "released"] } },
    include: {
      capsule: { select: { ownerUserId: true } },
      media: { include: { asset: true } },
      grants: { include: { person: true } },
      releaseJobs: true,
    },
  });
  if (!item || !recipientCanView(recipientUserId, item)) throw new AppError(404, "NOT_FOUND", "File not found.");
  const grant = item.grants.find((entry) => !entry.revokedAt && entry.person.linkedUserId === recipientUserId);
  const file = item.media.find((entry) => entry.mediaAssetId === assetId && !entry.asset.deletedAt && entry.asset.status === "ready");
  if (!grant || !file) throw new AppError(404, "NOT_FOUND", "File not found.");
  return createMediaShare(prisma, {
    ownerUserId: item.capsule.ownerUserId,
    itemId,
    assetId,
    personId: grant.personId,
    expiresInHours: 24,
    now,
  });
}

export async function openMediaShare(prisma: PrismaClient, recipientUserId: string, token: string, now: Date) {
  const row = await prisma.mediaShareLink.findUnique({
    where: { tokenHash: sha256(token) },
    include: {
      asset: true,
      person: true,
      item: {
        include: {
          capsule: { select: { ownerUserId: true } },
          grants: { include: { person: true } },
          releaseJobs: true,
        },
      },
    },
  });
  if (!row) throw new AppError(404, "NOT_FOUND", "This link is not valid.");
  if (row.recipientUserId !== recipientUserId) {
    throw new AppError(403, "LINK_RECIPIENT_MISMATCH", "This link is for a different account.");
  }
  const state = shareState(row, now);
  if (state === "revoked") throw new AppError(403, "LINK_REVOKED", "The owner revoked this link.");
  if (state === "expired") {
    if (row.status !== "expired") await prisma.mediaShareLink.update({ where: { id: row.id }, data: { status: "expired" } });
    throw new AppError(403, "LINK_EXPIRED", "This link has expired.");
  }
  const fileStillThere = row.asset.status === "ready" && !row.asset.deletedAt && row.item.status !== "cancelled";
  const attached = await prisma.itemMedia.findUnique({
    where: { itemId_mediaAssetId: { itemId: row.capsuleItemId, mediaAssetId: row.mediaAssetId } },
  });
  if (!fileStillThere || !attached || row.asset.ownerUserId !== row.ownerUserId) {
    await revokeMediaShares(prisma, { id: row.id }, now);
    throw new AppError(403, "LINK_REVOKED", "This file is no longer available.");
  }
  if (!recipientCanView(recipientUserId, row.item)) {
    throw new AppError(403, "LINK_NOT_READY", "This file is not available yet.");
  }
  await prisma.mediaShareLink.update({ where: { id: row.id }, data: { lastAccessAt: now } });
  await audit(prisma, {
    actorUserId: recipientUserId,
    action: "media.share_opened",
    entityType: "media_share_link",
    entityId: row.id,
    metadata: { assetId: row.mediaAssetId },
  });
  return {
    access: "granted" as const,
    expiresAt: row.expiresAt.toISOString(),
    recipientTimeZone: await recipientZone(prisma, recipientUserId, row.person.timeZone),
    file: {
      id: row.asset.id,
      mimeType: row.asset.mimeType,
      originalName: row.asset.originalName,
      kind: row.asset.mimeType.startsWith("video/") ? "video" as const : "photo" as const,
    },
  };
}
