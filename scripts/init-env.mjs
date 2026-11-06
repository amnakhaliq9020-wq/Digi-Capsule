import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

if (existsSync(".env")) {
  console.log(".env already exists. Leaving it unchanged.");
  process.exit(0);
}

const example = readFileSync(".env.example", "utf8");
const key = randomBytes(32).toString("base64");
const env = example.replace("replace-with-32-byte-base64", key);
writeFileSync(".env", env, "utf8");
console.log("Wrote .env with a new local DATA_ENCRYPTION_KEY.");
console.log("Start Postgres with: docker compose up -d");
