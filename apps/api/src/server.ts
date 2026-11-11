import { buildApp } from "./app";
import { env } from "./env";
import { OFFICIAL_FROM, usesLiveSmtp } from "./lib/mail";

const app = await buildApp();
await app.listen({ host: env.API_HOST, port: env.API_PORT });
console.info(`Digi Capsule API listening on ${env.API_HOST}:${env.API_PORT}`);
console.info(`Mail transport: ${usesLiveSmtp() ? "smtp" : "console"}`);
console.info(`Mail sender: ${OFFICIAL_FROM}`);
