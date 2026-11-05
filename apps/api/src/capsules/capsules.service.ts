import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CapsuleDto } from './dto';

@Injectable()
export class CapsulesService {
  constructor(private readonly prisma: PrismaService) {}

  list(ownerId: string) {
    return this.prisma.capsule.findMany({
      where: { ownerId },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        title: true,
        description: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { memories: true } },
      },
    });
  }

  async get(ownerId: string, id: string) {
    const capsule = await this.prisma.capsule.findFirst({
      where: { id, ownerId },
      select: {
        id: true,
        title: true,
        description: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { memories: true } },
      },
    });
    if (!capsule) throw new NotFoundException('Capsule not found.');
    return capsule;
  }

  create(ownerId: string, dto: CapsuleDto) {
    return this.prisma.capsule.create({
      data: { ownerId, title: dto.title, description: dto.description ?? null },
      select: { id: true, title: true, description: true, createdAt: true, updatedAt: true },
    });
  }
}
