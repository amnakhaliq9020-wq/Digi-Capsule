import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

const envFile = path.resolve(import.meta.dirname, "../.env");
if (!existsSync(envFile)) {
  console.error("Missing .env. From the repository root, run: npm run init-env");
  process.exit(1);
}
process.loadEnvFile(envFile);

const [command, ...args] = process.argv.slice(2);
if (!command) {
  console.error("Usage: node scripts/with-root-env.mjs <command> [args]");
  process.exit(1);
}

function quoteArg(arg) {
  if (arg.length === 0) return '""';
  if (!/[\s"]/u.test(arg)) return arg;
  return `"${arg.replaceAll('"', '\\"')}"`;
}

const child = spawn([command, ...args].map(quoteArg).join(" "), {
  stdio: "inherit",
  shell: true,
  env: process.env,
});
child.on("exit", (code) => process.exit(code ?? 1));
