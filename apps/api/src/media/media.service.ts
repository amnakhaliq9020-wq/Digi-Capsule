import { BadRequestException, Injectable, NotFoundException, StreamableFile } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { MemoryType } from '@prisma/client';
import { createReadStream } from 'node:fs';
import { mkdir, open, rename, rm, stat, unlink } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { FILE_RULES, UploadKind, isPlainText, linkTtlSeconds, matchesMagic, maxBytesFor } from './media-limits';

const assetSelect = {
  id: true,
  originalName: true,
  mimeType: true,
  sizeBytes: true,
  kind: true,
  memoryItemId: true,
  createdAt: true,
} as const;

type MediaToken = {
  purpose: string;
  sub: string;
  assetId: string;
};

@Injectable()
export class MediaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  root() {
    if (process.env.PRIVATE_MEDIA_ROOT) return path.resolve(process.env.PRIVATE_MEDIA_ROOT);
    const nested = path.basename(process.cwd()) === 'api';
    return path.resolve(process.cwd(), nested ? '../../data/private-media' : 'data/private-media');
  }

  async save(ownerId: string, file: UploadedFile, kind: UploadKind) {
    const rule = this.ruleFor(file.originalname, kind, file.mimetype);
    const size = file.size;
    if (!size || size > maxBytesFor(kind)) {
      throw new BadRequestException('This file is larger than the allowed size.');
    }

    const header = await this.readHeader(file.path);
    if (rule.plainText) {
      if (!isPlainText(header) || size > maxBytesFor(kind)) {
        throw new BadRequestException('Choose a plain text document.');
      }
    } else if (!matchesMagic(header, rule.magics)) {
      throw new BadRequestException(this.typeMessage(kind));
    }

    const id = randomUUID();
    const extension = path.extname(file.originalname).toLowerCase();
    const storageKey = `${ownerId}/${id}${extension}`;
    const destination = this.resolveKey(storageKey);
    await mkdir(path.dirname(destination), { recursive: true });
    await rename(file.path, destination);

    try {
      return await this.prisma.mediaAsset.create({
        data: {
          id,
          ownerId,
          originalName: this.safeName(file.originalname),
          mimeType: rule.mimes[0],
          sizeBytes: size,
          storageKey,
          kind: kind as MemoryType,
        },
        select: assetSelect,
      });
    } catch (error) {
      await unlink(destination).catch(() => undefined);
      console.error('Media record failed', error instanceof Error ? error.name : 'error');
      throw new BadRequestException('The file could not be stored. Please try again.');
    }
  }

  async remove(ownerId: string, id: string) {
    const asset = await this.prisma.mediaAsset.findFirst({ where: { id, ownerId } });
    if (!asset) throw new NotFoundException('File not found.');
    await this.prisma.mediaAsset.delete({ where: { id: asset.id } });
    await unlink(this.resolveKey(asset.storageKey)).catch(() => undefined);
    return { ok: true };
  }

  async content(ownerId: string, id: string) {
    const asset = await this.owned(ownerId, id);
    return this.stream(asset);
  }

  async createLink(ownerId: string, id: string) {
    const asset = await this.owned(ownerId, id);
    const expiresIn = linkTtlSeconds();
    const token = await this.jwt.signAsync(
      { purpose: 'media-access', sub: ownerId, assetId: asset.id },
      { expiresIn },
    );
    return {
      url: `/media/access?token=${encodeURIComponent(token)}`,
      expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
    };
  }

  async contentFromToken(token: string) {
    let payload: MediaToken;
    try {
      payload = await this.jwt.verifyAsync<MediaToken>(token);
    } catch {
      throw new NotFoundException('This download link is no longer valid.');
    }
    if (payload.purpose !== 'media-access' || !payload.sub || !payload.assetId) {
      throw new NotFoundException('This download link is no longer valid.');
    }
    const asset = await this.owned(payload.sub, payload.assetId);
    return this.stream(asset);
  }

  async ownedAssets(ownerId: string, ids: string[]) {
    if (!ids.length) return [];
    return this.prisma.mediaAsset.findMany({
      where: { ownerId, id: { in: ids } },
      select: { ...assetSelect, storageKey: true },
    });
  }

  async deleteFiles(storageKeys: string[]) {
    await Promise.all(storageKeys.map((key) => unlink(this.resolveKey(key)).catch(() => undefined)));
  }

  private async owned(ownerId: string, id: string) {
    const asset = await this.prisma.mediaAsset.findFirst({ where: { id, ownerId } });
    if (!asset) throw new NotFoundException('File not found.');
    return asset;
  }

  private async stream(asset: { storageKey: string; mimeType: string; originalName: string; sizeBytes: number }) {
    const fullPath = this.resolveKey(asset.storageKey);
    try {
      await stat(fullPath);
    } catch {
      throw new NotFoundException('File not found.');
    }
    return new StreamableFile(createReadStream(fullPath), {
      type: asset.mimeType,
      disposition: `inline; filename="${asset.originalName.replace(/["\r\n]/g, '')}"`,
      length: asset.sizeBytes,
    });
  }

  private async readHeader(filePath: string) {
    const handle = await open(filePath, 'r');
    try {
      const header = Buffer.alloc(64);
      const { bytesRead } = await handle.read(header, 0, 64, 0);
      return header.subarray(0, bytesRead);
    } finally {
      await handle.close();
    }
  }

  private resolveKey(storageKey: string) {
    const root = this.root();
    const full = path.resolve(root, storageKey);
    if (full !== root && !full.startsWith(root + path.sep)) {
      throw new NotFoundException('File not found.');
    }
    return full;
  }

  private ruleFor(originalName: string, kind: UploadKind, mime: string) {
    const extension = path.extname(originalName).toLowerCase();
    const rule = FILE_RULES.find((item) => item.kind === kind && item.extensions.includes(extension));
    if (!rule) throw new BadRequestException(this.typeMessage(kind));
    if (mime && mime !== 'application/octet-stream' && !rule.mimes.includes(mime)) {
      throw new BadRequestException(this.typeMessage(kind));
    }
    return rule;
  }

  private typeMessage(kind: UploadKind) {
    switch (kind) {
      case 'PHOTO':
        return 'Use a JPG or PNG image.';
      case 'VIDEO':
        return 'Use an MP4, MOV, or WEBM video.';
      case 'AUDIO':
        return 'Use an MP3, WAV, M4A, OGG, or WEBM audio file.';
      case 'DOCUMENT':
        return 'Use a PDF, DOC, DOCX, or TXT document.';
    }
  }

  private safeName(name: string) {
    const base = path.basename(name).replace(/[^\w.\- ()]+/g, '').slice(0, 180);
    return base || 'upload';
  }
}

type UploadedFile = { originalname: string; mimetype: string; size: number; path: string };

export async function removeTemp(file?: { path?: string }) {
  if (!file?.path) return;
  await rm(file.path, { force: true }).catch(() => undefined);
}
