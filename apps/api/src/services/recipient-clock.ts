import type { PrismaClient } from "@digi/db";
import { exactInstant } from "@digi/domain";

type PersonClock = { id: string; linkedUserId: string | null; timeZone: string | null };

/**
 * A linked account's IANA zone wins. A contact zone is next.
 * The sender's selected zone is only the fallback when the recipient has not chosen one.
 */
export async function recipientTimeZones(
  prisma: PrismaClient,
  people: PersonClock[],
  fallbackTimeZone: string,
): Promise<Map<string, string>> {
  const ids = [...new Set(people.map((person) => person.linkedUserId).filter((id): id is string => Boolean(id)))];
  const profiles = ids.length
    ? await prisma.profile.findMany({ where: { userId: { in: ids } }, select: { userId: true, timeZone: true } })
    : [];
  const byUser = new Map(profiles.map((profile) => [profile.userId, profile.timeZone]));
  const zones = new Map<string, string>();
  for (const person of people) {
    const linked = person.linkedUserId ? byUser.get(person.linkedUserId) : undefined;
    zones.set(person.id, linked || person.timeZone || fallbackTimeZone);
  }
  return zones;
}

export function zonedDelivery(localDate: string, localTime: string, timeZone: string): Date {
  return exactInstant(localDate, localTime, timeZone);
}
