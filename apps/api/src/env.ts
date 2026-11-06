import { existsSync } from "node:fs";
import path from "node:path";
import { z } from "zod";

const found: string[] = [];
let dir = process.cwd();
for (let i = 0; i < 6; i += 1) {
  const candidate = path.join(dir, ".env");
  if (existsSync(candidate)) found.push(candidate);
  const parent = path.dirname(dir);
  if (parent === dir) break;
  dir = parent;
}
for (const file of found.reverse()) {
  process.loadEnvFile(file);
}

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1),
  API_HOST: z.string().default("0.0.0.0"),
  API_PORT: z.coerce.number().int().positive().default(3001),
  WEB_ORIGIN: z.string().url().default("http://localhost:3000"),
  DATA_ENCRYPTION_KEY: z.string().min(1),
  STORAGE_DRIVER: z.enum(["local", "s3"]).default("local"),
  LOCAL_STORAGE_DIR: z.string().default("./var/storage"),
  S3_ENDPOINT: z.string().optional().default(""),
  S3_REGION: z.string().default("auto"),
  S3_BUCKET: z.string().optional().default(""),
  S3_ACCESS_KEY_ID: z.string().optional().default(""),
  S3_SECRET_ACCESS_KEY: z.string().optional().default(""),
  S3_FORCE_PATH_STYLE: z.enum(["true", "false"]).default("true"),
  MAX_PHOTO_BYTES: z.coerce.number().int().positive().default(15 * 1024 * 1024),
  MAX_VIDEO_BYTES: z.coerce.number().int().positive().default(100 * 1024 * 1024),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  const fields = parsed.error.issues.map((issue) => issue.path.join(".")).join(", ");
  throw new Error(`Invalid environment. Check: ${fields}`);
}

function encryptionKey(value: string): Buffer {
  const key = Buffer.from(value, "base64");
  if (key.length !== 32) {
    throw new Error("DATA_ENCRYPTION_KEY must be 32 bytes encoded as base64. Run npm run init-env.");
  }
  return key;
}

export const env = {
  ...parsed.data,
  encryptionKey: encryptionKey(parsed.data.DATA_ENCRYPTION_KEY),
};

export function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

/** Simulated clock and dev routes. Hard-disabled in production. */
export function isTestMode(): boolean {
  return !isProduction() && process.env.DIGI_TEST_MODE === "true";
}

/**
 * Content jobs for the "If I am gone" review.
 * Hard-disabled in production for this milestone, regardless of the flag value.
 */
export function isVerificationReleaseEnabled(): boolean {
  return !isProduction() && process.env.VERIFICATION_RELEASES_ENABLED === "true";
}
