import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { env } from "../env";

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function tokenMatches(storedHash: string, presented: string): boolean {
  const actual = Buffer.from(sha256(presented), "hex");
  const expected = Buffer.from(storedHash, "hex");
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}

function copyBytes(value: Buffer): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(value);
}

export function encryptText(plain: string): { ciphertext: Uint8Array<ArrayBuffer>; nonce: Uint8Array<ArrayBuffer>; tag: Uint8Array<ArrayBuffer> } {
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", env.encryptionKey, nonce);
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return { ciphertext: copyBytes(ciphertext), nonce: copyBytes(nonce), tag: copyBytes(cipher.getAuthTag()) };
}

export function decryptText(ciphertext: Buffer, nonce: Buffer, tag: Buffer): string {
  const decipher = createDecipheriv("aes-256-gcm", env.encryptionKey, nonce);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}
