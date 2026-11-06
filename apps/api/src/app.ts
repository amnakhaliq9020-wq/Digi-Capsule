import { PrismaClient } from "@digi/db";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import multipart from "@fastify/multipart";
import rateLimit from "@fastify/rate-limit";
import Fastify from "fastify";
import type { StoragePort } from "./lib/storage";
import { env, isTestMode, isVerificationReleaseEnabled } from "./env";
import { AppError } from "./errors";
import { createStorage } from "./lib/storage";
import { authRoutes } from "./routes/auth";
import { checkInRoutes } from "./routes/checkin";
import { contactRoutes } from "./routes/contacts";
import { dashboardRoutes } from "./routes/dashboard";
import { devRoutes } from "./routes/dev";
import { mediaRoutes } from "./routes/media";
import { memoryRoutes } from "./routes/memories";

declare module "fastify" {
  interface FastifyInstance {
    prisma: PrismaClient;
    storage: StoragePort;
  }
}

export async function buildApp() {
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL || "warn",
      redact: ["req.headers.authorization", "req.headers.cookie", "req.body.password", "req.body.body", "req.body.token", "req.body.code"],
    },
  });
  const prisma = new PrismaClient();
  const storage = createStorage();
  app.decorate("prisma", prisma);
  app.decorate("storage", storage);
  app.addHook("onClose", async () => {
    await prisma.$disconnect();
  });
  await app.register(cookie);
  await app.register(cors, { origin: env.WEB_ORIGIN, credentials: true });
  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(multipart, { limits: { fileSize: env.MAX_VIDEO_BYTES, files: 1 } });
  await app.register(rateLimit, { global: true, max: 300, timeWindow: "1 minute" });

  app.addHook("onRequest", async (request) => {
    if (!["POST", "PATCH", "PUT", "DELETE"].includes(request.method)) return;
    const origin = request.headers.origin;
    if (origin && origin !== env.WEB_ORIGIN) {
      throw new AppError(403, "FORBIDDEN", "This request origin is not allowed.");
    }
  });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof AppError) {
      return reply.status(error.statusCode).send({
        error: { code: error.code, message: error.message, details: error.details },
      });
    }
    const coded = error as { code?: string; statusCode?: number };
    if (coded.code === "FST_REQ_FILE_TOO_LARGE") {
      return reply.status(400).send({ error: { code: "FILE_TOO_LARGE", message: "That file is larger than the upload limit." } });
    }
    if (coded.statusCode === 429) {
      return reply.status(429).send({ error: { code: "RATE_LIMITED", message: "Too many requests. Wait a moment and try again." } });
    }
    if (coded.statusCode && coded.statusCode < 500) {
      return reply.status(coded.statusCode).send({
        error: { code: "VALIDATION_ERROR", message: "The request could not be read." },
      });
    }
    request.log.error({ err: error }, "request failed");
    return reply.status(500).send({ error: { code: "INTERNAL", message: "Something went wrong." } });
  });

  await app.register(async (api) => {
    api.get("/health", async () => {
      await prisma.$queryRaw`SELECT 1`;
      return {
        status: "ok",
        database: "up",
        testMode: isTestMode(),
        verificationReleasesEnabled: isVerificationReleaseEnabled(),
      };
    });
    await api.register(authRoutes);
    await api.register(memoryRoutes);
    await api.register(mediaRoutes);
    await api.register(contactRoutes);
    await api.register(checkInRoutes);
    await api.register(dashboardRoutes);
    await api.register(devRoutes);
  }, { prefix: "/v1" });

  return app;
}
