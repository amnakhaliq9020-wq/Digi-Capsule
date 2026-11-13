import { appendFileSync, mkdirSync, readdirSync, renameSync, statSync, unlinkSync } from "node:fs";
import path from "node:path";

const MAX_BYTES = 5_000_000;
const KEPT_ROTATIONS = 5;

export function opsLog(severity: "info" | "warn" | "error", event: string, fields: Record<string, string | number | boolean> = {}) {
  const line = JSON.stringify({ time: new Date().toISOString(), severity, event, ...fields });
  console.info(line);
  const dir = process.env.LOG_DIR;
  if (!dir) return;
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, "app.log");
  try {
    if (statSync(file).size > MAX_BYTES) {
      const rotated = path.join(dir, `app-${Date.now()}.log`);
      renameSync(file, rotated);
      const old = readdirSync(dir)
        .filter((name) => name.startsWith("app-") && name.endsWith(".log"))
        .sort();
      for (const name of old.slice(0, Math.max(0, old.length - KEPT_ROTATIONS))) {
        unlinkSync(path.join(dir, name));
      }
    }
  } catch {
    // The log file is created on the first write.
  }
  appendFileSync(file, `${line}\n`);
}
