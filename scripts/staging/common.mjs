import { spawn } from "node:child_process";
import { appendFileSync, mkdirSync } from "node:fs";
import path from "node:path";

export const STAGING_DB = "digi_capsule_staging";
export const CONTAINER = process.env.STAGING_POSTGRES_CONTAINER || "digi-staging-postgres";
export const DB_USER = process.env.STAGING_DB_USER || "digi_staging";

const BLOCKED = new Set(["digi_capsule", "digi_capsule_test", "postgres"]);

export function databaseName(url) {
  const pathOnly = String(url || "").split("?")[0];
  return decodeURIComponent(pathOnly.slice(pathOnly.lastIndexOf("/") + 1));
}

export function stagingUrl() {
  return process.env.STAGING_DATABASE_URL || "postgresql://digi_staging:digi_staging@localhost:5433/digi_capsule_staging";
}

export function assertStagingTarget(url = stagingUrl()) {
  const name = databaseName(url);
  if (BLOCKED.has(name) || name !== STAGING_DB) {
    throw new Error(`Refusing to continue. The database name is "${name || "missing"}". Only ${STAGING_DB} is allowed.`);
  }
  return url;
}

export function logOperation(event, fields = {}) {
  const { severity = "info", ...rest } = fields;
  const line = JSON.stringify({ time: new Date().toISOString(), severity, event, ...rest });
  console.log(line);
  const dir = path.resolve(process.env.LOG_DIR || "var/log/staging");
  mkdirSync(dir, { recursive: true });
  appendFileSync(path.join(dir, "operations.log"), `${line}\n`);
}

export function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const { input, ...spawnOptions } = options;
    const windowsCmd = process.platform === "win32" && command === "npx";
    const child = spawn(windowsCmd ? "npx.cmd" : command, args, {
      stdio: ["pipe", "pipe", "pipe"],
      ...spawnOptions,
      shell: windowsCmd,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) reject(new Error(stderr.trim() || stdout.trim() || `${command} exited ${code}`));
      else resolve(stdout);
    });
    if (input) child.stdin.end(input);
    else child.stdin.end();
  });
}

export function psql(sql, database = STAGING_DB) {
  return run("docker", ["exec", "-i", CONTAINER, "psql", "-v", "ON_ERROR_STOP=1", "-U", DB_USER, "-d", database, "-c", sql]);
}

export function psqlFile(file, database = STAGING_DB) {
  return run("docker", ["exec", "-i", CONTAINER, "psql", "-v", "ON_ERROR_STOP=1", "-U", DB_USER, "-d", database], { input: file });
}
