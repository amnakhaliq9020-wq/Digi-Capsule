import argon2 from "argon2";

const options = {
  type: argon2.argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
} as const;

export function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, options);
}

export function verifyPassword(hash: string, password: string): Promise<boolean> {
  return argon2.verify(hash, password);
}

let timingPad: Promise<string> | null = null;

/** Runs Argon2id even when the account is missing, so login timing does not reveal that fact. */
export async function verifyAgainstStoredHash(hash: string | null, password: string): Promise<boolean> {
  if (!hash) {
    timingPad ??= hashPassword("timing-pad-not-a-user-password");
    await verifyPassword(await timingPad, password);
    return false;
  }
  return verifyPassword(hash, password);
}
