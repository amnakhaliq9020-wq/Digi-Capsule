import { createHash } from "node:crypto";
import path from "node:path";
import type { FastifyInstance } from "fastify";
import { PHOTO_MIME_TYPES, VIDEO_MIME_TYPES } from "@digi/shared";
import { requireUser } from "../auth";
import { env } from "../env";
import { AppError } from "../errors";

function sanitizeName(name: string) {
  const base = path.basename(name || "upload").replace(/[^a-zA-Z0-9._-]/g, "_");
  return base.slice(0, 120) || "upload";
}

export async function mediaRoutes(app: FastifyInstance) {
  app.post("/memories/:id/attachments", async (request, reply) => {
    const user = await requireUser(request);
    const { id } = request.params as { id: string };
    const item = await app.prisma.capsuleItem.findFirst({
      where: { id, status: { not: "cancelled" }, capsule: { ownerUserId: user.id } },
      include: { releaseJobs: true },
    });
    if (!item) throw new AppError(404, "NOT_FOUND", "Memory not found.");
    if (item.status === "released" || item.releaseJobs.some((job) => job.status === "sent")) {
      throw new AppError(409, "ALREADY_DELIVERED", "Attachments cannot be changed after delivery.");
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
    if (body.length === 0) throw new AppError(400, "VALIDATION_ERROR", "The file is empty.");
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
      await app.prisma.mediaAsset.update({ where: { id: asset.id }, data: { status: "failed" } });
      throw error;
    }
    return reply.code(201).send({
      attachment: { id: asset.id, mimeType: mime, byteSize: body.length, originalName: sanitizeName(file.filename), kind: isVideo ? "video" : "photo" },
    });
  });

  app.delete("/memories/:id/attachments/:assetId", async (request, reply) => {
    const user = await requireUser(request);
    const { id, assetId } = request.params as { id: string; assetId: string };
    const link = await app.prisma.itemMedia.findFirst({
      where: { itemId: id, mediaAssetId: assetId, item: { capsule: { ownerUserId: user.id }, status: { notIn: ["cancelled", "released"] } } },
      include: { asset: true, item: { include: { releaseJobs: true } } },
    });
    if (!link) throw new AppError(404, "NOT_FOUND", "Attachment not found.");
    if (link.item.releaseJobs.some((job) => job.status === "sent")) {
      throw new AppError(409, "ALREADY_DELIVERED", "Attachments cannot be removed after delivery.");
    }
    await app.storage.remove(link.asset.storageKey);
    await app.prisma.mediaAsset.update({ where: { id: assetId }, data: { status: "deleted", deletedAt: new Date() } });
    await app.prisma.itemMedia.delete({ where: { itemId_mediaAssetId: { itemId: id, mediaAssetId: assetId } } });
    return reply.code(204).send();
  });

  app.get("/media/:assetId/content", async (request, reply) => {
    const user = await requireUser(request);
    const { assetId } = request.params as { assetId: string };
    const asset = await app.prisma.mediaAsset.findFirst({
      where: { id: assetId, ownerUserId: user.id, status: "ready", deletedAt: null },
    });
    if (!asset) throw new AppError(404, "NOT_FOUND", "File not found.");
    const stream = await app.storage.open(asset.storageKey);
    return reply
      .header("Content-Type", asset.mimeType)
      .header("Content-Disposition", `inline; filename="${asset.originalName.replace(/"/g, "")}"`)
      .header("Cache-Control", "private, no-store")
      .header("X-Content-Type-Options", "nosniff")
      .send(stream);
  });
}
