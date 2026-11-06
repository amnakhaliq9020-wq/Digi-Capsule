import { PgBoss } from "pg-boss";
import { env } from "./env";
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
  console.info("[worker] tick", result);
});

console.info("Digi Capsule worker started. Calendar rules and check-in reminders run every minute.");
console.info(`Verification content release enabled: ${process.env.VERIFICATION_RELEASES_ENABLED === "true" && process.env.NODE_ENV !== "production"}`);

async function shutdown() {
  await boss.stop({ graceful: true, timeout: 10_000 });
  await prisma.$disconnect();
  process.exit(0);
}

process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());
