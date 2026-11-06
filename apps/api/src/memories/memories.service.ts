import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { MemoryType, Prisma } from '@prisma/client';
import { MediaService } from '../media/media.service';
import { PrismaService } from '../prisma/prisma.service';
import { MemoryDto } from './dto';

const assetSelect = {
  id: true,
  originalName: true,
  mimeType: true,
  sizeBytes: true,
  kind: true,
} as const;

const detailSelect = {
  id: true,
  title: true,
  description: true,
  type: true,
  body: true,
  tags: true,
  status: true,
  capsuleId: true,
  createdAt: true,
  updatedAt: true,
  capsule: { select: { id: true, title: true } },
  assets: { select: assetSelect, orderBy: { createdAt: 'asc' as const } },
} as const;

@Injectable()
export class MemoriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly media: MediaService,
  ) {}

  async list(ownerId: string) {
    const memories = await this.prisma.memoryItem.findMany({
      where: { ownerId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        title: true,
        description: true,
        body: true,
        type: true,
        status: true,
        capsuleId: true,
        createdAt: true,
        updatedAt: true,
        capsule: { select: { title: true } },
      },
    });

    return memories.map((memory) => ({
      id: memory.id,
      title: memory.title,
      description: memory.description,
      preview: previewOf(memory.description, memory.body),
      type: memory.type,
      status: memory.status,
      capsuleId: memory.capsuleId,
      capsuleTitle: memory.capsule.title,
      createdAt: memory.createdAt,
      updatedAt: memory.updatedAt,
    }));
  }

  async get(ownerId: string, id: string) {
    const memory = await this.prisma.memoryItem.findFirst({
      where: { id, ownerId },
      select: detailSelect,
    });
    if (!memory) throw new NotFoundException('Memory not found.');
    return memory;
  }

  async create(ownerId: string, dto: MemoryDto) {
    const capsule = await this.prisma.capsule.findFirst({ where: { id: dto.capsuleId, ownerId }, select: { id: true } });
    if (!capsule) throw new BadRequestException('Create a capsule before saving a memory.');

    const assetIds = unique(dto.assetIds ?? []);
    await this.assertContent(ownerId, dto, assetIds, null);

    try {
      return await this.prisma.$transaction(async (tx) => {
        const created = await tx.memoryItem.create({
          data: {
            ownerId,
            capsuleId: capsule.id,
            title: dto.title,
            description: dto.description ?? null,
            type: dto.type,
            body: dto.type === MemoryType.LETTER ? dto.body ?? null : null,
            tags: dto.tags ?? [],
            status: 'DRAFT',
          },
          select: { id: true },
        });
        if (assetIds.length) {
          const linked = await tx.mediaAsset.updateMany({
            where: { id: { in: assetIds }, ownerId, memoryItemId: null, kind: dto.type },
            data: { memoryItemId: created.id },
          });
          if (linked.count !== assetIds.length) {
            throw new BadRequestException('Those files could not be attached to this memory.');
          }
        }
        return tx.memoryItem.findFirstOrThrow({ where: { id: created.id, ownerId }, select: detailSelect });
      });
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      console.error('Memory create failed', error instanceof Prisma.PrismaClientKnownRequestError ? error.code : 'error');
      throw new BadRequestException('The memory could not be saved. Please try again.');
    }
  }

  async update(ownerId: string, id: string, dto: MemoryDto) {
    const existing = await this.prisma.memoryItem.findFirst({
      where: { id, ownerId },
      select: { id: true, assets: { select: { id: true, storageKey: true } } },
    });
    if (!existing) throw new NotFoundException('Memory not found.');

    const capsule = await this.prisma.capsule.findFirst({ where: { id: dto.capsuleId, ownerId }, select: { id: true } });
    if (!capsule) throw new BadRequestException('Choose one of your capsules.');

    const assetIds = unique(dto.assetIds ?? []);
    await this.assertContent(ownerId, dto, assetIds, id);

    const removed = existing.assets.filter((asset) => !assetIds.includes(asset.id));

    try {
      const updated = await this.prisma.$transaction(async (tx) => {
        if (removed.length) {
          await tx.mediaAsset.deleteMany({ where: { id: { in: removed.map((asset) => asset.id) }, ownerId } });
        }
        if (assetIds.length) {
          const linked = await tx.mediaAsset.updateMany({
            where: {
              id: { in: assetIds },
              ownerId,
              kind: dto.type,
              OR: [{ memoryItemId: null }, { memoryItemId: id }],
            },
            data: { memoryItemId: id },
          });
          if (linked.count !== assetIds.length) {
            throw new BadRequestException('Those files could not be attached to this memory.');
          }
        }
        return tx.memoryItem.update({
          where: { id },
          data: {
            capsuleId: capsule.id,
            title: dto.title,
            description: dto.description ?? null,
            type: dto.type,
            body: dto.type === MemoryType.LETTER ? dto.body ?? null : null,
            tags: dto.tags ?? [],
            status: 'DRAFT',
          },
          select: detailSelect,
        });
      });
      await this.media.deleteFiles(removed.map((asset) => asset.storageKey));
      return updated;
    } catch (error) {
      if (error instanceof BadRequestException || error instanceof NotFoundException) throw error;
      console.error('Memory update failed', error instanceof Prisma.PrismaClientKnownRequestError ? error.code : 'error');
      throw new BadRequestException('The memory could not be saved. Please try again.');
    }
  }

  async remove(ownerId: string, id: string) {
    const existing = await this.prisma.memoryItem.findFirst({
      where: { id, ownerId },
      select: { id: true, assets: { select: { storageKey: true } } },
    });
    if (!existing) throw new NotFoundException('Memory not found.');
    await this.prisma.memoryItem.delete({ where: { id } });
    await this.media.deleteFiles(existing.assets.map((asset) => asset.storageKey));
    return { ok: true };
  }

  private async assertContent(ownerId: string, dto: MemoryDto, assetIds: string[], memoryId: string | null) {
    if (dto.type === MemoryType.LETTER) {
      if (!dto.body || dto.body.trim().length < 1) {
        throw new BadRequestException('Write the letter before saving.');
      }
      if (assetIds.length) throw new BadRequestException('A letter does not include uploaded files.');
      return;
    }

    const assets = await this.media.ownedAssets(ownerId, assetIds);
    if (assets.length !== assetIds.length) throw new BadRequestException('One of the selected files could not be found.');
    if (assets.some((asset) => asset.kind !== dto.type)) {
      throw new BadRequestException('The selected files do not match this memory type.');
    }
    if (assets.some((asset) => asset.memoryItemId && asset.memoryItemId !== memoryId)) {
      throw new BadRequestException('One of the selected files is already used by another memory.');
    }

    if (dto.type === MemoryType.PHOTO) {
      if (assetIds.length < 1) throw new BadRequestException('Add at least one photo.');
      return;
    }
    if (assetIds.length !== 1) {
      throw new BadRequestException('Add one file for this memory.');
    }
  }
}

function unique(values: string[]) {
  return [...new Set(values)];
}

function previewOf(description: string | null, body: string | null) {
  const source = description?.trim() || body?.trim() || '';
  if (source.length <= 180) return source;
  return `${source.slice(0, 177)}...`;
}
