import { readFileSync } from "node:fs";
import path from "node:path";
import { STAGING_DB, assertStagingTarget, logOperation, psql, psqlFile, run, stagingUrl } from "./common.mjs";

const fileArg = process.argv.find((arg) => arg.startsWith("--file="));
const confirmed = process.argv.includes("--confirm=STAGING");

try {
  assertStagingTarget(stagingUrl());
  if (!confirmed) throw new Error("Restore requires --confirm=STAGING. This flag is refused for any database other than digi_capsule_staging.");
  if (!fileArg) throw new Error("Pass --file=path\\to\\digi-capsule-staging-TIMESTAMP.sql");
  const file = path.resolve(fileArg.slice("--file=".length));
  if (!path.basename(file).startsWith("digi-capsule-staging-") || !file.endsWith(".sql")) {
    throw new Error("The backup filename must start with digi-capsule-staging- and end with .sql.");
  }
  const sql = readFileSync(file);
  logOperation("restore.started", { database: STAGING_DB, file: path.basename(file) });
  await psql(`SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${STAGING_DB}' AND pid <> pg_backend_pid();`, "postgres");
  await psql(`DROP DATABASE IF EXISTS ${STAGING_DB};`, "postgres");
  await psql(`CREATE DATABASE ${STAGING_DB};`, "postgres");
  await psqlFile(sql, STAGING_DB);
  await run(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "deploy", "--schema", "packages/db/prisma/schema.prisma"], {
    env: { ...process.env, DATABASE_URL: stagingUrl() },
  });
  const users = await psql("SELECT COUNT(*) FROM users;");
  const orphans = await psql("SELECT COUNT(*) FROM capsule_items ci LEFT JOIN capsules c ON c.id = ci.capsule_id WHERE c.id IS NULL;");
  const indexes = await psql("SELECT COUNT(*) FROM pg_indexes WHERE schemaname = 'public';");
  const userCount = Number((users.match(/\d+/) || ["0"])[0]);
  const orphanCount = Number((orphans.match(/\d+/) || ["1"])[0]);
  const indexCount = Number((indexes.match(/\d+/) || ["0"])[0]);
  if (orphanCount !== 0) throw new Error("Restored memories are missing their capsule relationship.");
  if (indexCount < 1) throw new Error("Restored database has no indexes.");
  logOperation("restore.completed", { database: STAGING_DB, file: path.basename(file), users: userCount, orphans: orphanCount, indexes: indexCount });
} catch (error) {
  logOperation("restore.failed", { severity: "error", message: error instanceof Error ? error.message : "restore failed" });
  process.exit(1);
}
