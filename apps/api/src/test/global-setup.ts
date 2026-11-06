import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const databaseUrl = process.env.TEST_DATABASE_URL || "postgresql://digi:digi@localhost:5432/digi_capsule_test";

export default async function setup() {
  const adminUrl = databaseUrl.replace(/\/[^/?]+(\?.*)?$/, "/postgres$1");
  const client = new pg.Client({ connectionString: adminUrl });
  await client.connect();
  const exists = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", ["digi_capsule_test"]);
  if (exists.rowCount === 0) {
    await client.query("CREATE DATABASE digi_capsule_test");
  }
  await client.end();
  const dbDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../packages/db");
  execSync("npx prisma migrate deploy", {
    cwd: dbDir,
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: databaseUrl },
  });
}
