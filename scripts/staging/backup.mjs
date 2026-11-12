import { mkdirSync, readdirSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { CONTAINER, DB_USER, STAGING_DB, assertStagingTarget, logOperation, run, stagingUrl } from "./common.mjs";

const retention = Number(process.env.STAGING_BACKUP_RETENTION || 14);
const directory = path.resolve(process.env.STAGING_BACKUP_DIR || "var/backups/staging");

try {
  const url = assertStagingTarget(stagingUrl());
  mkdirSync(directory, { recursive: true });
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const filename = `digi-capsule-staging-${stamp}.sql`;
  const target = path.join(directory, filename);
  logOperation("backup.started", { database: STAGING_DB });
  const dump = await run("docker", [
    "exec",
    CONTAINER,
    "pg_dump",
    "-U",
    DB_USER,
    "-d",
    STAGING_DB,
    "--no-owner",
    "--no-acl",
  ]);
  writeFileSync(target, dump);
  const bytes = statSync(target).size;
  if (bytes < 100) throw new Error("The backup file is too small to contain a database.");
  const files = readdirSync(directory)
    .filter((name) => name.startsWith("digi-capsule-staging-") && name.endsWith(".sql"))
    .sort();
  const extra = files.slice(0, Math.max(0, files.length - retention));
  for (const name of extra) unlinkSync(path.join(directory, name));
  logOperation("backup.completed", { database: STAGING_DB, file: filename, bytes, retained: Math.min(files.length, retention) });
  if (url.includes("digi_capsule_test") || databaseNameUnsafe(url)) {
    throw new Error("Backup target check failed.");
  }
} catch (error) {
  logOperation("backup.failed", { severity: "error", message: error instanceof Error ? error.message : "backup failed" });
  process.exit(1);
}

function databaseNameUnsafe(url) {
  return /\/digi_capsule(\?|$)/.test(url) && !url.includes("digi_capsule_staging");
}
