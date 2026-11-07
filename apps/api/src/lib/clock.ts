import type { PrismaClient } from "@digi/db";
import { isTestMode } from "../env";

/**
 * Normal scheduling, check-in, and the automatic worker use the server clock.
 * The simulated clock is used only while the automated test suite is running
 * (NODE_ENV=test and DIGI_TEST_MODE). Production never uses it.
 * The developer console reads the simulated clock through readDeveloperClock.
 */
export function usesSimulationClock(): boolean {
  return process.env.NODE_ENV === "test" && isTestMode();
}

export function serverNow(): Date {
  return new Date();
}

export async function currentInstant(prisma: PrismaClient): Promise<Date> {
  if (!usesSimulationClock()) return serverNow();
  return readDeveloperClock(prisma);
}

export async function readDeveloperClock(prisma: PrismaClient): Promise<Date> {
  if (!isTestMode()) return serverNow();
  const row = await prisma.devClock.findUnique({ where: { id: 1 } });
  return row?.simulatedNow ?? serverNow();
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
