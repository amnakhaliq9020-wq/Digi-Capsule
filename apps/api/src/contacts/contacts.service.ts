import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { ContactRole, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateContactDto, UpdateContactDto } from './dto';

const contactSelect = {
  id: true,
  fullName: true,
  email: true,
  phone: true,
  role: true,
  slot: true,
  updatedAt: true,
} as const;

const SLOT_LIMIT_MESSAGE = 'Both contact slots are occupied. Edit an existing contact to make changes.';
const DUPLICATE_MESSAGE = 'A contact with this email is already saved.';

@Injectable()
export class ContactsService {
  constructor(private readonly prisma: PrismaService) {}

  list(ownerId: string) {
    return this.prisma.contact.findMany({
      where: { ownerId, role: ContactRole.RECIPIENT },
      orderBy: { slot: 'asc' },
      select: contactSelect,
    });
  }

  async get(ownerId: string, id: string) {
    const contact = await this.prisma.contact.findFirst({
      where: { id, ownerId, role: ContactRole.RECIPIENT },
      select: contactSelect,
    });
    if (!contact) {
      throw new NotFoundException('Contact not found.');
    }
    return contact;
  }

  async create(ownerId: string, dto: CreateContactDto) {
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          const existing = await tx.contact.findMany({
            where: { ownerId, role: ContactRole.RECIPIENT },
            select: { email: true, slot: true },
          });

          if (existing.length >= 2) {
            throw new ConflictException(SLOT_LIMIT_MESSAGE);
          }

          if (existing.some((contact) => contact.email === dto.email)) {
            throw new ConflictException(DUPLICATE_MESSAGE);
          }

          const slot = dto.slot ?? (existing.some((contact) => contact.slot === 1) ? 2 : 1);
          if (existing.some((contact) => contact.slot === slot)) {
            throw new ConflictException(`Contact slot ${slot} is already occupied.`);
          }

          return tx.contact.create({
            data: {
              ownerId,
              fullName: dto.fullName,
              email: dto.email,
              phone: dto.phone ?? null,
              role: ContactRole.RECIPIENT,
              slot,
            },
            select: contactSelect,
          });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      throw this.mapWriteError(error);
    }
  }

  async update(ownerId: string, id: string, dto: UpdateContactDto) {
    const existing = await this.prisma.contact.findFirst({
      where: { id, ownerId, role: ContactRole.RECIPIENT },
      select: { id: true },
    });
    if (!existing) {
      throw new NotFoundException('Contact not found.');
    }

    const duplicate = await this.prisma.contact.findFirst({
      where: {
        ownerId,
        role: ContactRole.RECIPIENT,
        email: dto.email,
        NOT: { id },
      },
      select: { id: true },
    });
    if (duplicate) {
      throw new ConflictException(DUPLICATE_MESSAGE);
    }

    try {
      return await this.prisma.contact.update({
        where: { id },
        data: {
          fullName: dto.fullName,
          email: dto.email,
          phone: dto.phone ?? null,
        },
        select: contactSelect,
      });
    } catch (error) {
      throw this.mapWriteError(error);
    }
  }

  async remove(ownerId: string, id: string) {
    const existing = await this.prisma.contact.findFirst({
      where: { id, ownerId, role: ContactRole.RECIPIENT },
      select: { id: true },
    });
    if (!existing) {
      throw new NotFoundException('Contact not found.');
    }

    await this.prisma.contact.delete({ where: { id } });
    return { ok: true };
  }

  private mapWriteError(error: unknown): Error {
    if (
      error instanceof ConflictException ||
      error instanceof NotFoundException ||
      error instanceof InternalServerErrorException
    ) {
      return error;
    }

    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const target = Array.isArray(error.meta?.target) ? error.meta.target.join(',') : String(error.meta?.target ?? '');
      if (target.includes('email')) {
        return new ConflictException(DUPLICATE_MESSAGE);
      }
      return new ConflictException(SLOT_LIMIT_MESSAGE);
    }

    console.error('Contact write failed', error instanceof Prisma.PrismaClientKnownRequestError ? error.code : 'error');
    return new InternalServerErrorException('Unable to save the contact. Please try again.');
  }
}
