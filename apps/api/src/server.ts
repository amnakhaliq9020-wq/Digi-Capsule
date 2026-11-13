import { buildApp } from "./app";
import { env } from "./env";
import { OFFICIAL_FROM, usesLiveSmtp } from "./lib/mail";
import { opsLog } from "./lib/ops-log";

const app = await buildApp();
await app.listen({ host: env.API_HOST, port: env.API_PORT });
opsLog("info", "api.started", {
  environment: process.env.APP_ENV || "development",
  port: env.API_PORT,
  mailTransport: usesLiveSmtp() ? "smtp" : "console",
  mailSender: OFFICIAL_FROM,
});

async function shutdown(signal: string) {
  opsLog("info", "api.stopping", { signal });
  await app.close();
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
