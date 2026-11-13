import { createCipheriv, randomBytes } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import argon2 from "argon2";

const STAGING_DB = "digi_capsule_staging";
const prisma = new PrismaClient();

const accounts = [
  { email: "staging.author@example.test", name: "Staging Author", zone: "Asia/Karachi" },
  { email: "staging.recipient@example.test", name: "Staging Recipient", zone: "America/New_York" },
  { email: "staging.trusted@example.test", name: "Staging Trusted Contact", zone: "Europe/London" },
  { email: "staging.verifier@example.test", name: "Staging Verifier", zone: "UTC" },
  { email: "staging.admin@example.test", name: "Staging Administrator", zone: "UTC" },
] as const;

function databaseName(url: string): string {
  const pathOnly = url.split("?")[0] ?? "";
  return decodeURIComponent(pathOnly.slice(pathOnly.lastIndexOf("/") + 1));
}

function encryptLetter(plain: string) {
  const key = Buffer.from(process.env.DATA_ENCRYPTION_KEY || "", "base64");
  if (key.length !== 32) throw new Error("DATA_ENCRYPTION_KEY must be 32 bytes of base64.");
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, nonce);
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return { ciphertext, nonce, tag: cipher.getAuthTag() };
}

async function ensureUser(email: string, name: string, zone: string, passwordHash: string) {
  const now = new Date();
  const due = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    await prisma.profile.upsert({
      where: { userId: existing.id },
      update: { displayName: name, timeZone: zone },
      create: { userId: existing.id, displayName: name, timeZone: zone },
    });
    return existing.id;
  }
  const user = await prisma.user.create({
    data: {
      email,
      emailVerifiedAt: now,
      passwordHash,
      profile: { create: { displayName: name, timeZone: zone } },
      consentRecords: {
        create: [
          { purpose: "terms", policyVersion: "2026-11-10", grantedAt: now, source: "staging-seed" },
          { purpose: "privacy", policyVersion: "2026-11-10", grantedAt: now, source: "staging-seed" },
        ],
      },
      checkInPolicy: {
        create: {
          intervalDays: 30,
          nextDueAt: due,
          nextCheckAt: due,
          reminderOffsets: [0, 7, 14],
          unreachableAfterDays: 21,
        },
      },
      checkInCycles: { create: { dueAt: due, state: "due" } },
      capsules: { create: { title: "My memories", status: "active" } },
    },
  });
  return user.id;
}

async function main() {
  const name = databaseName(process.env.DATABASE_URL || "");
  if (name !== STAGING_DB) {
    throw new Error(`Refusing to seed "${name}". Staging seed only runs against ${STAGING_DB}.`);
  }
  const password = process.env.STAGING_SEED_PASSWORD || "Staging-Only-1";
  const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
  const ids = new Map<string, string>();
  for (const account of accounts) {
    ids.set(account.email, await ensureUser(account.email, account.name, account.zone, passwordHash));
  }

  const authorId = ids.get("staging.author@example.test")!;
  const capsule = await prisma.capsule.findFirstOrThrow({ where: { ownerUserId: authorId } });
  const letter = encryptLetter("This is a fictional staging letter. It is not a real memory.");
  let item = await prisma.capsuleItem.findFirst({ where: { capsuleId: capsule.id, title: "Staging sample memory" } });
  if (!item) {
    item = await prisma.capsuleItem.create({
      data: {
        capsuleId: capsule.id,
        title: "Staging sample memory",
        status: "scheduled",
        bodyCiphertext: letter.ciphertext,
        bodyNonce: letter.nonce,
        bodyTag: letter.tag,
      },
    });
  }

  async function contact(email: string, displayName: string, role: "recipient" | "trusted_contact" | "verifier", phone: string) {
    let person = await prisma.person.findFirst({ where: { ownerUserId: authorId, email } });
    if (!person) {
      person = await prisma.person.create({
        data: {
          ownerUserId: authorId,
          linkedUserId: ids.get(email),
          displayName,
          email,
          phone,
          timeZone: "UTC",
        },
      });
    }
    const existingRole = await prisma.contactRole.findFirst({ where: { personId: person.id, role, revokedAt: null } });
    if (!existingRole) {
      await prisma.contactRole.create({
        data: { personId: person.id, role, channelVerifiedAt: new Date() },
      });
    }
    return person.id;
  }

  const recipientId = await contact("staging.recipient@example.test", "Staging Recipient", "recipient", "+1 555 010 0301");
  await contact("staging.trusted@example.test", "Staging Trusted Contact", "trusted_contact", "+1 555 010 0302");
  await contact("staging.verifier@example.test", "Staging Verifier", "verifier", "+1 555 010 0303");

  const grant = await prisma.itemGrant.findFirst({ where: { capsuleItemId: item.id, personId: recipientId } });
  if (!grant) {
    await prisma.itemGrant.create({ data: { capsuleItemId: item.id, personId: recipientId, visibility: "released_only" } });
  }
  const rule = await prisma.releaseRule.findFirst({ where: { capsuleItemId: item.id, status: "active" } });
  if (!rule) {
    await prisma.releaseRule.create({
      data: { capsuleItemId: item.id, trigger: "after_verification", timeZone: "Asia/Karachi", status: "active" },
    });
  }
  await prisma.notificationDelivery.upsert({
    where: { idempotencyKey: "staging-seed:notice:author" },
    update: {},
    create: {
      userId: authorId,
      idempotencyKey: "staging-seed:notice:author",
      channel: "email",
      templateId: "staging_seed_notice",
      destinationHash: "staging-seed",
      status: "sent",
      relatedType: "staging_seed",
      relatedId: authorId,
      providerResponse: "staging_seed_not_sent",
      sentAt: new Date(),
    },
  });
  console.log(JSON.stringify({
    time: new Date().toISOString(),
    severity: "info",
    event: "staging.seed_completed",
    database: name,
    users: accounts.length,
  }));
}

main()
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "seed failed";
    console.error(JSON.stringify({ time: new Date().toISOString(), severity: "error", event: "staging.seed_failed", message }));
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
