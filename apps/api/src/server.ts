import { buildApp } from "./app";
import { env } from "./env";

const app = await buildApp();
await app.listen({ host: env.API_HOST, port: env.API_PORT });
console.info(`Digi Capsule API listening on ${env.API_HOST}:${env.API_PORT}`);
