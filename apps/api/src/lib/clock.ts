import type { PrismaClient } from "@digi/db";
import { isTestMode } from "../env";

export async function currentInstant(prisma: PrismaClient): Promise<Date> {
  if (!isTestMode()) return new Date();
  const row = await prisma.devClock.findUnique({ where: { id: 1 } });
  return row?.simulatedNow ?? new Date();
}

export async function setSimulatedNow(prisma: PrismaClient, simulatedNow: Date): Promise<Date> {
  if (!isTestMode()) {
    throw new Error("TEST_CLOCK_DISABLED");
  }
  await prisma.devClock.upsert({
    where: { id: 1 },
    create: { id: 1, simulatedNow },
    update: { simulatedNow },
  });
  return simulatedNow;
}
