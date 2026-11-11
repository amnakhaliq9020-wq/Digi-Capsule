import { PgBoss } from "pg-boss";
import { env } from "./env";
import { OFFICIAL_FROM, usesLiveSmtp } from "./lib/mail";
import { PrismaClient } from "@digi/db";
import { runWorkerTick } from "./services/worker-tick";

const prisma = new PrismaClient();
const boss = new PgBoss({ connectionString: env.DATABASE_URL, schema: "pgboss" });

boss.on("error", (error) => {
  console.error("[worker] queue error", error.message);
});

await boss.start();
await boss.createQueue("digi-tick");
await boss.schedule("digi-tick", "* * * * *", {}, { tz: "UTC" });
await boss.work("digi-tick", async () => {
  const result = await runWorkerTick(prisma);
  console.info("[worker] tick (server time)", result);
});

await boss.createQueue("digi-check-in");
await boss.schedule("digi-check-in", "0 3 * * *", {}, { tz: "UTC" });
await boss.work("digi-check-in", async () => {
  const result = await runWorkerTick(prisma);
  console.info("[worker] daily account check (03:00 UTC)", result);
});

console.info("Digi Capsule worker started. It uses real server time. Account check-ins run every minute and on the daily 03:00 UTC schedule. The test-console clock is separate.");
console.info(`Mail transport: ${usesLiveSmtp() ? "smtp" : "console"}`);
console.info(`Mail sender: ${OFFICIAL_FROM}`);
console.info(`Verification content release enabled: ${process.env.VERIFICATION_RELEASES_ENABLED === "true" && process.env.NODE_ENV !== "production"}`);

async function shutdown() {
  await boss.stop({ graceful: true, timeout: 10_000 });
  await prisma.$disconnect();
  process.exit(0);
}

process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());
