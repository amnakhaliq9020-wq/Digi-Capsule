import { PgBoss } from "pg-boss";
import { env } from "./env";
import { usesLiveSmtp } from "./lib/mail";
import { opsLog } from "./lib/ops-log";
import { PrismaClient } from "@digi/db";
import { runWorkerTick } from "./services/worker-tick";

const prisma = new PrismaClient();
const boss = new PgBoss({ connectionString: env.DATABASE_URL, schema: "pgboss" });

boss.on("error", () => {
  opsLog("error", "worker.queue_error");
});

await boss.start();
await boss.createQueue("digi-tick");
await boss.schedule("digi-tick", "* * * * *", {}, { tz: "UTC" });
await boss.work("digi-tick", async () => {
  const result = await runWorkerTick(prisma);
  opsLog("info", "worker.tick", {
    remindersSent: result.remindersSent,
    calendarJobsSent: result.calendarJobsSent,
    verificationJobsSent: result.verificationJobsSent,
  });
});

await boss.createQueue("digi-check-in");
await boss.schedule("digi-check-in", "0 3 * * *", {}, { tz: "UTC" });
await boss.work("digi-check-in", async () => {
  const result = await runWorkerTick(prisma);
  opsLog("info", "worker.daily_check", { remindersSent: result.remindersSent });
});

opsLog("info", "worker.started", {
  environment: process.env.APP_ENV || "development",
  queue: "digi-tick",
  singletonSchedule: true,
  mailTransport: usesLiveSmtp() ? "smtp" : "console",
});

async function shutdown() {
  opsLog("info", "worker.stopping");
  await boss.stop({ graceful: true, timeout: 10_000 });
  await prisma.$disconnect();
  process.exit(0);
}

process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());
