import { assertStagingTarget, logOperation, psql, stagingUrl } from "./common.mjs";

try {
  assertStagingTarget(stagingUrl());
  const author = await psql("SELECT email FROM users WHERE email = 'staging.author@example.test';");
  const memory = await psql("SELECT title FROM capsule_items WHERE title = 'Staging sample memory';");
  const notice = await psql("SELECT status FROM notification_deliveries WHERE idempotency_key = 'staging-seed:notice:author';");
  if (!author.includes("staging.author@example.test")) throw new Error("The staging author is missing.");
  if (!memory.includes("Staging sample memory")) throw new Error("The staging sample memory is missing.");
  if (!notice.includes("sent")) throw new Error("The staging notification record is missing.");
  logOperation("verify.completed", { database: "digi_capsule_staging", author: true, memory: true, notice: true });
} catch (error) {
  logOperation("verify.failed", { severity: "error", message: error instanceof Error ? error.message : "verify failed" });
  process.exit(1);
}
