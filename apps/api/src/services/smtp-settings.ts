import type { PrismaClient } from "@digi/db";
import { env } from "../env";
import { decryptText, encryptText } from "../lib/crypto";
import { OFFICIAL_FROM, OFFICIAL_SENDER_ADDRESS, OFFICIAL_SENDER_NAME, setMailRuntime, smtpConfigured } from "../lib/mail";

type Encryption = "starttls" | "ssl";

type Saved = {
  host: string;
  port: number;
  username: string;
  encryption: string;
  passwordCipher: Uint8Array | null;
  passwordNonce: Uint8Array | null;
  passwordTag: Uint8Array | null;
  connectionStatus: string;
  lastSuccessAt: Date | null;
  lastFailureAt: Date | null;
  lastFailureCode: string | null;
  senderVerifiedAt: Date | null;
};

function passwordFrom(row: Saved | null): string {
  if (row?.passwordCipher && row.passwordNonce && row.passwordTag) {
    return decryptText(Buffer.from(row.passwordCipher), Buffer.from(row.passwordNonce), Buffer.from(row.passwordTag));
  }
  return env.smtp.password;
}

function applyRuntime(row: Saved | null) {
  const password = passwordFrom(row);
  if (!row || !password) {
    setMailRuntime(null);
    return;
  }
  const encryption: Encryption = row.encryption === "ssl" ? "ssl" : "starttls";
  setMailRuntime({ host: row.host, port: row.port, user: row.username, password, encryption });
}

export function smtpStatus(row: Saved | null) {
  const passwordSet = Boolean(passwordFrom(row));
  const encryption: Encryption = row?.encryption === "ssl" || env.smtp.port === 465 ? (row?.encryption === "ssl" || !row && env.smtp.port === 465 ? "ssl" : "starttls") : "starttls";
  return {
    sender: {
      name: OFFICIAL_SENDER_NAME,
      email: OFFICIAL_SENDER_ADDRESS,
      replyTo: OFFICIAL_SENDER_ADDRESS,
      from: OFFICIAL_FROM,
    },
    server: {
      host: row?.host || env.smtp.host,
      port: row?.port || env.smtp.port,
      username: row?.username || env.smtp.user,
      encryption: row ? (row.encryption === "ssl" ? "ssl" : "starttls") : encryption,
      passwordSet,
    },
    status: {
      configured: Boolean((row?.host || env.smtp.host) && (row?.username || env.smtp.user) && passwordSet && env.smtp.from.toLowerCase() === OFFICIAL_SENDER_ADDRESS),
      connection: row?.connectionStatus || "unverified",
      lastSuccessAt: row?.lastSuccessAt?.toISOString() ?? null,
      lastFailureAt: row?.lastFailureAt?.toISOString() ?? null,
      lastFailureCode: row?.lastFailureCode ?? null,
      senderVerifiedAt: row?.senderVerifiedAt?.toISOString() ?? null,
    },
  };
}

export async function readSmtpSettings(prisma: PrismaClient) {
  const row = await prisma.mailServerSetting.findUnique({ where: { id: 1 } });
  applyRuntime(row);
  return smtpStatus(row);
}

export async function saveSmtpSettings(
  prisma: PrismaClient,
  input: { host: string; port: number; username: string; password?: string; encryption: Encryption },
) {
  const existing = await prisma.mailServerSetting.findUnique({ where: { id: 1 } });
  const password = input.password?.trim() || passwordFrom(existing);
  if (!password) {
    const error = new Error("Enter the SMTP password.");
    Object.assign(error, { code: "PASSWORD_REQUIRED" });
    throw error;
  }
  const sealed = input.password?.trim() ? encryptText(password) : null;
  const row = await prisma.mailServerSetting.upsert({
    where: { id: 1 },
    create: {
      id: 1,
      host: input.host,
      port: input.port,
      username: input.username,
      encryption: input.encryption,
      passwordCipher: sealed ? sealed.ciphertext : existing?.passwordCipher,
      passwordNonce: sealed ? sealed.nonce : existing?.passwordNonce,
      passwordTag: sealed ? sealed.tag : existing?.passwordTag,
      connectionStatus: "unverified",
      senderVerifiedAt: null,
    },
    update: {
      host: input.host,
      port: input.port,
      username: input.username,
      encryption: input.encryption,
      ...(sealed
        ? { passwordCipher: sealed.ciphertext, passwordNonce: sealed.nonce, passwordTag: sealed.tag }
        : {}),
      connectionStatus: "unverified",
      senderVerifiedAt: null,
    },
  });
  applyRuntime(row);
  return smtpStatus(row);
}

export async function markSmtpVerified(prisma: PrismaClient, result: { ok: true } | { ok: false; code: string }) {
  const now = new Date();
  await prisma.mailServerSetting.update({
    where: { id: 1 },
    data: result.ok
      ? { connectionStatus: "connected", senderVerifiedAt: now, lastFailureCode: null }
      : { connectionStatus: "failed", lastFailureAt: now, lastFailureCode: result.code, senderVerifiedAt: null },
  });
  return readSmtpSettings(prisma);
}

export async function markSmtpSend(prisma: PrismaClient, result: { ok: true } | { ok: false; code: string }) {
  const now = new Date();
  await prisma.mailServerSetting.upsert({
    where: { id: 1 },
    create: {
      id: 1,
      host: env.smtp.host || "unconfigured",
      port: env.smtp.port,
      username: env.smtp.user || "unconfigured",
      encryption: env.smtp.port === 465 ? "ssl" : "starttls",
      connectionStatus: result.ok ? "connected" : "failed",
      lastSuccessAt: result.ok ? now : null,
      lastFailureAt: result.ok ? null : now,
      lastFailureCode: result.ok ? null : result.code,
      senderVerifiedAt: result.ok ? now : null,
    },
    update: result.ok
      ? { connectionStatus: "connected", lastSuccessAt: now, senderVerifiedAt: now, lastFailureCode: null }
      : { connectionStatus: "failed", lastFailureAt: now, lastFailureCode: result.code },
  });
}

export function smtpReady(): boolean {
  return smtpConfigured();
}
