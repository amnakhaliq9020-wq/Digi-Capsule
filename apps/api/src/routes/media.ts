import { createHash } from "node:crypto";
import path from "node:path";
import type { FastifyInstance, FastifyReply } from "fastify";
import type { Readable } from "node:stream";
import { z } from "zod";
import { PHOTO_MIME_TYPES, VIDEO_MIME_TYPES } from "@digi/shared";
import { requireUser } from "../auth";
import { env } from "../env";
import { AppError } from "../errors";
import { recipientCanView } from "../lib/access";
import { audit } from "../lib/audit";
import { currentInstant } from "../lib/clock";
import { randomToken, sha256 } from "../lib/crypto";
import { createMediaShare, listMediaShares, openMediaShare, refreshMediaShare, revokeMediaShare, revokeMediaShares, SHARE_EXPIRY_HOURS } from "../services/media-shares";

function matchesDeclaredType(mime: string, body: Buffer): boolean {
  if (mime === "image/jpeg") return body.length >= 3 && body[0] === 0xff && body[1] === 0xd8 && body[2] === 0xff;
  if (mime === "image/png") return body.length >= 8 && body.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (mime === "image/gif") {
    const header = body.subarray(0, 6).toString("ascii");
    return header === "GIF87a" || header === "GIF89a";
  }
  if (mime === "image/webp") {
    return body.length >= 12 && body.subarray(0, 4).toString("ascii") === "RIFF" && body.subarray(8, 12).toString("ascii") === "WEBP";
  }
  if (mime === "video/webm") return body.length >= 4 && body[0] === 0x1a && body[1] === 0x45 && body[2] === 0xdf && body[3] === 0xa3;
  if (mime === "video/mp4" || mime === "video/quicktime") return body.length >= 8 && body.subarray(4, 8).toString("ascii") === "ftyp";
  return false;
}

function sanitizeName(name: string) {
  const base = path.basename(name || "upload").replace(/[^a-zA-Z0-9._-]/g, "_");
  return base.slice(0, 120) || "upload";
}

function assertAssetId(id: string) {
  if (!z.string().uuid().safeParse(id).success) throw new AppError(404, "NOT_FOUND", "File not found.");
}

async function assetForUser(app: FastifyInstance, userId: string, assetId: string) {
  const owned = await app.prisma.mediaAsset.findFirst({
    where: { id: assetId, ownerUserId: userId, status: "ready", deletedAt: null },
  });
  if (owned) return owned;
  const links = await app.prisma.itemMedia.findMany({
    where: { mediaAssetId: assetId, asset: { status: "ready", deletedAt: null }, item: { status: { in: ["released", "scheduled"] } } },
    include: {
      asset: true,
      item: {
        include: {
          capsule: { select: { ownerUserId: true } },
          grants: { include: { person: true } },
          releaseJobs: true,
        },
      },
    },
  });
  return links.find((link) => recipientCanView(userId, link.item))?.asset ?? null;
}

function byteRange(header: string | undefined, size: number) {
  if (!header) return null;
  const match = /^bytes=(\d+)-(\d*)$/.exec(header.trim());
  if (!match) return "invalid" as const;
  const start = Number(match[1]);
  const end = match[2] ? Number(match[2]) : size - 1;
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || start >= size || end < start) return "invalid" as const;
  return { start, end: Math.min(end, size - 1) };
}

function sendPrivateFile(
  reply: FastifyReply,
  asset: { mimeType: string; originalName: string; byteSize: number },
  stream: Readable,
  range?: { start: number; end: number } | null,
) {
  const name = asset.originalName.replace(/"/g, "");
  reply
    .header("Content-Type", asset.mimeType)
    .header("Content-Disposition", `inline; filename="${name}"`)
    .header("Cache-Control", "private, no-store")
    .header("Pragma", "no-cache")
    .header("Referrer-Policy", "no-referrer")
    .header("X-Content-Type-Options", "nosniff")
    .header("Accept-Ranges", "bytes");
  if (!range) {
    reply.header("Content-Length", String(asset.byteSize));
    return reply.send(stream);
  }
  reply.header("Content-Range", `bytes ${range.start}-${range.end}/${asset.byteSize}`);
  reply.header("Content-Length", String(range.end - range.start + 1));
  return reply.code(206).send(stream);
}

export async function mediaRoutes(app: FastifyInstance) {
  app.post("/memories/:id/attachments", async (request, reply) => {
    const user = await requireUser(request);
    const { id } = request.params as { id: string };
    if (!z.string().uuid().safeParse(id).success) throw new AppError(404, "NOT_FOUND", "Memory not found.");
    const item = await app.prisma.capsuleItem.findFirst({
      where: { id, status: { not: "cancelled" }, capsule: { ownerUserId: user.id } },
      include: { releaseJobs: true },
    });
    if (!item) throw new AppError(404, "NOT_FOUND", "Memory not found.");
    if (item.status === "released" || item.releaseJobs.some((job) => job.status === "sent")) {
      throw new AppError(409, "ALREADY_DELIVERED", "Attachments cannot be changed after delivery.");
    }
    const usageWhere = { ownerUserId: user.id, status: { in: ["pending", "ready"] as ("pending" | "ready")[] }, deletedAt: null };
    const usedCount = await app.prisma.mediaAsset.count({ where: usageWhere });
    const usedBytes = await app.prisma.mediaAsset.aggregate({ where: usageWhere, _sum: { byteSize: true } });
    if (usedCount >= env.MAX_UPLOADS_PER_USER) {
      throw new AppError(400, "UPLOAD_LIMIT", "This account has reached its file upload limit.");
    }
    const file = await request.file();
    if (!file) throw new AppError(400, "VALIDATION_ERROR", "Choose a photo or video to upload.");
    const mime = file.mimetype;
    const isPhoto = (PHOTO_MIME_TYPES as readonly string[]).includes(mime);
    const isVideo = (VIDEO_MIME_TYPES as readonly string[]).includes(mime);
    if (!isPhoto && !isVideo) {
      throw new AppError(400, "UNSUPPORTED_FILE", "Upload a JPEG, PNG, WEBP, GIF, MP4, WEBM, or MOV file.");
    }
    const body = await file.toBuffer();
    const limit = isPhoto ? env.MAX_PHOTO_BYTES : env.MAX_VIDEO_BYTES;
    if (body.length > limit) {
      throw new AppError(400, "FILE_TOO_LARGE", isPhoto ? "Photos must be 15 MB or smaller." : "Videos must be 100 MB or smaller.");
    }
    if ((usedBytes._sum.byteSize ?? 0) + body.length > env.MAX_UPLOAD_BYTES_PER_USER) {
      throw new AppError(400, "UPLOAD_LIMIT", "This account has reached its upload storage limit.");
    }
    if (body.length === 0) throw new AppError(400, "VALIDATION_ERROR", "The file is empty.");
    if (!matchesDeclaredType(mime, body)) {
      throw new AppError(400, "UNSUPPORTED_FILE", "That file does not match the photo or video type it claims to be.");
    }
    const asset = await app.prisma.mediaAsset.create({
      data: {
        ownerUserId: user.id,
        storageKey: "pending",
        mimeType: mime,
        byteSize: body.length,
        sha256: createHash("sha256").update(body).digest("hex"),
        originalName: sanitizeName(file.filename),
        status: "pending",
      },
    });
    const storageKey = `${user.id}/${asset.id}`;
    try {
      await app.storage.put(storageKey, body, mime);
      await app.prisma.mediaAsset.update({ where: { id: asset.id }, data: { storageKey, status: "ready" } });
      const count = await app.prisma.itemMedia.count({ where: { itemId: item.id } });
      await app.prisma.itemMedia.create({ data: { itemId: item.id, mediaAssetId: asset.id, position: count } });
    } catch (error) {
      await app.storage.remove(storageKey).catch(() => undefined);
      await app.prisma.mediaAsset.update({ where: { id: asset.id }, data: { storageKey, status: "failed" } });
      throw error;
    }
    return reply.code(201).send({
      attachment: { id: asset.id, mimeType: mime, byteSize: body.length, originalName: sanitizeName(file.filename), kind: isVideo ? "video" : "photo" },
    });
  });

  app.delete("/memories/:id/attachments/:assetId", async (request, reply) => {
    const user = await requireUser(request);
    const { id, assetId } = request.params as { id: string; assetId: string };
    if (!z.string().uuid().safeParse(id).success) throw new AppError(404, "NOT_FOUND", "Attachment not found.");
    assertAssetId(assetId);
    const link = await app.prisma.itemMedia.findFirst({
      where: { itemId: id, mediaAssetId: assetId, item: { capsule: { ownerUserId: user.id }, status: { notIn: ["cancelled", "released"] } } },
      include: { asset: true, item: { include: { releaseJobs: true } } },
    });
    if (!link) throw new AppError(404, "NOT_FOUND", "Attachment not found.");
    if (link.item.releaseJobs.some((job) => job.status === "sent")) {
      throw new AppError(409, "ALREADY_DELIVERED", "Attachments cannot be removed after delivery.");
    }
    const now = await currentInstant(app.prisma);
    await revokeMediaShares(app.prisma, { mediaAssetId: assetId }, now);
    await app.storage.remove(link.asset.storageKey);
    await app.prisma.mediaAsset.update({ where: { id: assetId }, data: { status: "deleted", deletedAt: now } });
    await app.prisma.itemMedia.delete({ where: { itemId_mediaAssetId: { itemId: id, mediaAssetId: assetId } } });
    return reply.code(204).send();
  });

  app.get("/media/:assetId/content", async (request, reply) => {
    const user = await requireUser(request);
    const { assetId } = request.params as { assetId: string };
    assertAssetId(assetId);
    const asset = await assetForUser(app, user.id, assetId);
    if (!asset) throw new AppError(404, "NOT_FOUND", "File not found.");
    await audit(app.prisma, {
      actorUserId: user.id,
      action: "media.read",
      entityType: "media_asset",
      entityId: asset.id,
    });
    const range = byteRange(request.headers.range, asset.byteSize);
    if (range === "invalid") return reply.code(416).header("Content-Range", `bytes */${asset.byteSize}`).send();
    const stream = await app.storage.open(asset.storageKey, range ?? undefined);
    return sendPrivateFile(reply, asset, stream, range);
  });

  app.post(
    "/media/:assetId/signed-url",
    { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } },
    async (request) => {
      const user = await requireUser(request);
      const { assetId } = request.params as { assetId: string };
      assertAssetId(assetId);
      const asset = await assetForUser(app, user.id, assetId);
      if (!asset) throw new AppError(404, "NOT_FOUND", "File not found.");
      const token = randomToken();
      const now = await currentInstant(app.prisma);
      const expiresAt = new Date(now.getTime() + env.SIGNED_URL_TTL_SECONDS * 1000);
      await app.prisma.mediaAccessToken.create({
        data: { assetId: asset.id, userId: user.id, tokenHash: sha256(token), expiresAt },
      });
      return { url: `/v1/media/signed/${token}`, expiresAt: expiresAt.toISOString() };
    },
  );

  app.get("/media/signed/:token", async (request, reply) => {
    const user = await requireUser(request);
    const { token } = request.params as { token: string };
    const now = await currentInstant(app.prisma);
    const row = await app.prisma.mediaAccessToken.findUnique({
      where: { tokenHash: sha256(token) },
      include: { asset: true },
    });
    if (
      !row ||
      row.userId !== user.id ||
      row.expiresAt.getTime() <= now.getTime() ||
      row.asset.ownerUserId !== row.userId ||
      row.asset.status !== "ready" ||
      row.asset.deletedAt
    ) {
      throw new AppError(401, "UNAUTHORIZED", "This file link is invalid or has expired.");
    }
    await audit(app.prisma, {
      actorUserId: row.userId,
      action: "media.signed_read",
      entityType: "media_asset",
      entityId: row.assetId,
    });
    const range = byteRange(request.headers.range, row.asset.byteSize);
    if (range === "invalid") return reply.code(416).header("Content-Range", `bytes */${row.asset.byteSize}`).send();
    const stream = await app.storage.open(row.asset.storageKey, range ?? undefined);
    return sendPrivateFile(reply, row.asset, stream, range);
  });

  app.get("/memories/:id/shares", async (request) => {
    const user = await requireUser(request);
    const { id } = request.params as { id: string };
    if (!z.string().uuid().safeParse(id).success) throw new AppError(404, "NOT_FOUND", "Memory not found.");
    const now = await currentInstant(app.prisma);
    return { shares: await listMediaShares(app.prisma, user.id, id, now) };
  });

  app.post("/memories/:id/media/:assetId/shares", { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } }, async (request, reply) => {
    const user = await requireUser(request);
    const { id, assetId } = request.params as { id: string; assetId: string };
    if (!z.string().uuid().safeParse(id).success) throw new AppError(404, "NOT_FOUND", "Memory not found.");
    assertAssetId(assetId);
    const parsed = z.object({
      recipientId: z.string().uuid(),
      expiresInHours: z.number().int().default(24),
    }).safeParse(request.body ?? {});
    if (!parsed.success) throw new AppError(400, "VALIDATION_ERROR", "Choose a recipient and a link lifetime.");
    const now = await currentInstant(app.prisma);
    const share = await createMediaShare(app.prisma, {
      ownerUserId: user.id,
      itemId: id,
      assetId,
      personId: parsed.data.recipientId,
      expiresInHours: parsed.data.expiresInHours,
      now,
    });
    return reply.code(201).send({ share, permittedHours: SHARE_EXPIRY_HOURS });
  });

  app.post("/memories/:id/media/:assetId/shares/refresh", { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, async (request, reply) => {
    const user = await requireUser(request);
    const { id, assetId } = request.params as { id: string; assetId: string };
    if (!z.string().uuid().safeParse(id).success) throw new AppError(404, "NOT_FOUND", "File not found.");
    assertAssetId(assetId);
    const now = await currentInstant(app.prisma);
    const share = await refreshMediaShare(app.prisma, user.id, id, assetId, now);
    return reply.code(201).send({ share });
  });

  app.post("/media/shares/:id/revoke", async (request) => {
    const user = await requireUser(request);
    const { id } = request.params as { id: string };
    if (!z.string().uuid().safeParse(id).success) throw new AppError(404, "NOT_FOUND", "Link not found.");
    const now = await currentInstant(app.prisma);
    return { share: await revokeMediaShare(app.prisma, user.id, id, now) };
  });

  app.post("/media/shares/open", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (request) => {
    const user = await requireUser(request);
    const parsed = z.object({ token: z.string().min(20).max(200) }).safeParse(request.body);
    if (!parsed.success) throw new AppError(404, "NOT_FOUND", "This link is not valid.");
    const now = await currentInstant(app.prisma);
    return openMediaShare(app.prisma, user.id, parsed.data.token, now);
  });
}
