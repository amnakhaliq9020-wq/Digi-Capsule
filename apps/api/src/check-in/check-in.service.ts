import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { warningsFor } from './warnings';

function intervalDays() {
  const raw = process.env.CHECK_IN_INTERVAL_DAYS;
  const value = raw ? Number(raw) : 30;
  return Number.isInteger(value) && value >= 1 && value <= 365 ? value : 30;
}

function addDays(date: Date, days: number) {
  const next = new Date(date.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

@Injectable()
export class CheckInService {
  constructor(private readonly prisma: PrismaService) {}

  async status(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { createdAt: true, lastCheckInAt: true },
    });
    if (!user) throw new NotFoundException('Account not found.');
    return this.present(user.createdAt, user.lastCheckInAt);
  }

  async confirm(userId: string) {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { lastCheckInAt: new Date() },
      select: { createdAt: true, lastCheckInAt: true },
    });
    return this.present(user.createdAt, user.lastCheckInAt);
  }

  private present(createdAt: Date, lastCheckInAt: Date | null) {
    const days = intervalDays();
    const anchor = lastCheckInAt ?? createdAt;
    const nextCheckInAt = addDays(anchor, days);
    return {
      lastCheckInAt,
      nextCheckInAt,
      intervalDays: days,
      warnings: warningsFor(nextCheckInAt),
    };
  }
}
