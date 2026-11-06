import { PrismaClient } from "@prisma/client";
import argon2 from "argon2";

const prisma = new PrismaClient();

async function main() {
  await prisma.$queryRaw`SELECT 1`;
  if (process.env.SEED_DEMO !== "true") {
    console.log("Seed complete. No accounts were created. Set SEED_DEMO=true to add a synthetic demo author.");
    return;
  }

  const email = (process.env.SEED_DEMO_EMAIL || "demo.author@example.test").toLowerCase();
  const password = process.env.SEED_DEMO_PASSWORD || "Change-Me-Demo-1";
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`Synthetic demo account already exists: ${email}`);
    return;
  }

  const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
  const now = new Date();
  const due = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  await prisma.user.create({
    data: {
      email,
      emailVerifiedAt: now,
      passwordHash,
      profile: { create: { displayName: "Demo Author", timeZone: "UTC" } },
      consentRecords: {
        create: [
          { purpose: "terms", policyVersion: "2026-11-05", grantedAt: now, source: "seed" },
          { purpose: "privacy", policyVersion: "2026-11-05", grantedAt: now, source: "seed" },
        ],
      },
      checkInPolicy: {
        create: {
          intervalDays: 30,
          nextDueAt: due,
          reminderOffsets: [0, 7, 14],
          unreachableAfterDays: 21,
        },
      },
      checkInCycles: { create: { dueAt: due, state: "due" } },
      capsules: { create: { title: "My memories", status: "active" } },
    },
  });
  console.log(`Created synthetic demo account ${email}. Password comes from SEED_DEMO_PASSWORD.`);
  console.log("This account is fake. Do not use real family contacts.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
