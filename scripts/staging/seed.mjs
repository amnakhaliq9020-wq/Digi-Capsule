import { assertStagingTarget, logOperation, run, stagingUrl } from "./common.mjs";

try {
  const url = assertStagingTarget(stagingUrl());
  logOperation("seed.started", { database: "digi_capsule_staging" });
  await run(process.execPath, ["node_modules/tsx/dist/cli.mjs", "packages/db/prisma/staging-seed.ts"], {
    env: { ...process.env, DATABASE_URL: url },
  });
  logOperation("seed.completed", { database: "digi_capsule_staging" });
} catch (error) {
  logOperation("seed.failed", { severity: "error", message: error instanceof Error ? error.message : "seed failed" });
  process.exit(1);
}
