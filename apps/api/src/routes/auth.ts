import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  EMAIL_VERIFICATION_TTL_HOURS,
  LOGIN_MAX_FAILURES,
  LOGIN_WINDOW_MINUTES,
  PASSWORD_RESET_MAX,
  PASSWORD_RESET_TTL_MINUTES,
  SESSION_TTL_HOURS,
  VERIFICATION_EMAIL_MAX,
  VERIFICATION_EMAIL_WINDOW_MINUTES,
} from "@digi/shared";
import { clearSessionCookie, requireUser, setSessionCookie } from "../auth";
import { env, isTestMode } from "../env";
import { AppError, fromZod, isUniqueViolation } from "../errors";
import { audit } from "../lib/audit";
import { randomToken, sha256 } from "../lib/crypto";
import { deliverEmail } from "../lib/notify";
import { hashPassword, verifyAgainstStoredHash, verifyPassword } from "../lib/passwords";
import { provisionAuthor } from "../services/account";

const passwordSchema = z
  .string()
  .min(10, "Use at least 10 characters.")
  .max(200, "Password is too long.")
  .regex(/[A-Za-z]/, "Include at least one letter.")
  .regex(/[0-9]/, "Include at least one number.");

const registerSchema = z.object({
  displayName: z.string().trim().min(1, "Enter your name.").max(80, "Name is too long."),
  email: z.string().trim().email("Enter a valid email address.").max(254),
  password: passwordSchema,
  timeZone: z.string().trim().min(1, "Choose a time zone."),
});

const loginSchema = z.object({
  email: z.string().trim().email("Enter a valid email address."),
  password: z.string().min(1, "Enter your password."),
});

const RESET_MESSAGE =
  "If that email is registered, password reset instructions have been recorded. This application does not send them through an outside email service.";

function assertTimeZone(timeZone: string) {
  try {
    Intl.DateTimeFormat("en-US", { timeZone });
  } catch {
    throw new AppError(400, "VALIDATION_ERROR", "Choose a valid time zone.", {
      fieldErrors: { timeZone: ["Choose a valid time zone."] },
    });
  }
}

export async function authRoutes(app: FastifyInstance) {
  app.post("/auth/register", async (request, reply) => {
    const parsed = registerSchema.safeParse(request.body);
    if (!parsed.success) throw fromZod(parsed.error);
    const email = parsed.data.email.toLowerCase();
    assertTimeZone(parsed.data.timeZone);
    const now = new Date();
    const passwordHash = await hashPassword(parsed.data.password);
    const token = randomToken(24);
      const sessionToken = randomToken();
      try {
      const user = await app.prisma.$transaction(async (tx) => {
        const created = await tx.user.create({ data: { email, passwordHash } });
        await provisionAuthor(tx, {
          userId: created.id,
          displayName: parsed.data.displayName,
          timeZone: parsed.data.timeZone,
          now,
        });
        await tx.person.updateMany({ where: { email }, data: { linkedUserId: created.id } });
        await tx.emailVerificationToken.create({
          data: {
            userId: created.id,
            tokenHash: sha256(token),
            expiresAt: new Date(now.getTime() + 48 * 60 * 60 * 1000),
          },
        });
        await tx.session.create({
          data: {
            userId: created.id,
            tokenHash: sha256(sessionToken),
            expiresAt: new Date(Date.now() + SESSION_TTL_HOURS * 60 * 60 * 1000),
            userAgent: request.headers["user-agent"]?.slice(0, 200),
          },
        });
        await audit(tx, { actorUserId: created.id, action: "user.registered", entityType: "user", entityId: created.id });
        return created;
      });
      await sendVerificationMessage(app, user.id, email, token);
      setSessionCookie(reply, sessionToken, SESSION_TTL_HOURS * 60 * 60);
      return reply.code(201).send({
        user: { id: user.id, email, displayName: parsed.data.displayName, emailVerified: false },
        devVerificationToken: isTestMode() ? token : undefined,
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new AppError(409, "EMAIL_IN_USE", "An account with this email already exists.");
      }
      throw error;
    }
  });

  app.post("/auth/login", async (request, reply) => {
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) throw fromZod(parsed.error);
    const email = parsed.data.email.toLowerCase();
    const since = new Date(Date.now() - LOGIN_WINDOW_MINUTES * 60 * 1000);
    const failures = await app.prisma.loginAttempt.count({
      where: { email, success: false, createdAt: { gt: since } },
    });
    if (failures >= LOGIN_MAX_FAILURES) {
      throw new AppError(429, "RATE_LIMITED", "Too many sign-in attempts. Try again in 15 minutes.");
    }
    const user = await app.prisma.user.findUnique({ where: { email }, include: { profile: true } });
    const valid = await verifyAgainstStoredHash(user?.passwordHash ?? null, parsed.data.password);
    await app.prisma.loginAttempt.create({ data: { email, success: Boolean(valid && user) } });
    if (!user || !valid || !user.profile) {
      throw new AppError(401, "INVALID_CREDENTIALS", "Email or password is incorrect.");
    }
    const sessionToken = randomToken();
    await app.prisma.session.create({
      data: {
        userId: user.id,
        tokenHash: sha256(sessionToken),
        expiresAt: new Date(Date.now() + SESSION_TTL_HOURS * 60 * 60 * 1000),
        userAgent: request.headers["user-agent"]?.slice(0, 200),
      },
    });
    await audit(app.prisma, { actorUserId: user.id, action: "user.logged_in", entityType: "user", entityId: user.id });
    setSessionCookie(reply, sessionToken, SESSION_TTL_HOURS * 60 * 60);
    return {
      user: {
        id: user.id,
        email: user.email,
        displayName: user.profile.displayName,
        emailVerified: Boolean(user.emailVerifiedAt),
      },
    };
  });

  app.post("/auth/logout", async (request, reply) => {
    const token = request.cookies.digi_session;
    if (token) {
      await app.prisma.session.updateMany({
        where: { tokenHash: sha256(token), revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
    clearSessionCookie(reply);
    return { ok: true };
  });

  app.get("/auth/me", async (request) => {
    const user = await requireUser(request);
    return {
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        timeZone: user.timeZone,
        emailVerified: Boolean(user.emailVerifiedAt),
      },
    };
  });

  app.patch("/auth/me", async (request) => {
    const user = await requireUser(request);
    const parsed = z.object({ timeZone: z.string().trim().min(1, "Choose a time zone.") }).safeParse(request.body);
    if (!parsed.success) throw fromZod(parsed.error);
    assertTimeZone(parsed.data.timeZone);
    await app.prisma.profile.update({ where: { userId: user.id }, data: { timeZone: parsed.data.timeZone } });
    await audit(app.prisma, { actorUserId: user.id, action: "profile.timezone_updated", entityType: "user", entityId: user.id });
    return {
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        timeZone: parsed.data.timeZone,
        emailVerified: Boolean(user.emailVerifiedAt),
      },
    };
  });

  app.post("/auth/verify-email", async (request) => {
    const parsed = z.object({ token: z.string().min(10, "Enter the verification code.") }).safeParse(request.body);
    if (!parsed.success) throw fromZod(parsed.error);
    const row = await app.prisma.emailVerificationToken.findUnique({ where: { tokenHash: sha256(parsed.data.token) } });
    if (!row || row.usedAt || row.expiresAt.getTime() < Date.now()) {
      throw new AppError(400, "INVALID_TOKEN", "That verification code is invalid or expired.");
    }
    const sessionToken = request.cookies.digi_session;
    if (sessionToken) {
      const session = await app.prisma.session.findUnique({ where: { tokenHash: sha256(sessionToken) } });
      if (session && !session.revokedAt && session.expiresAt.getTime() > Date.now() && session.userId !== row.userId) {
        throw new AppError(400, "INVALID_TOKEN", "That verification code is invalid or expired.");
      }
    }
    const now = new Date();
    await app.prisma.$transaction([
      app.prisma.emailVerificationToken.update({ where: { id: row.id }, data: { usedAt: now } }),
      app.prisma.user.update({ where: { id: row.userId }, data: { emailVerifiedAt: now } }),
    ]);
    await audit(app.prisma, { actorUserId: row.userId, action: "user.email_verified", entityType: "user", entityId: row.userId });
    return { emailVerified: true };
  });

  app.post(
    "/auth/verify-email/resend",
    { config: { rateLimit: { max: 5, timeWindow: "15 minutes" } } },
    async (request) => {
      const user = await requireUser(request);
      if (user.emailVerifiedAt) return { emailVerified: true };
      const since = new Date(Date.now() - VERIFICATION_EMAIL_WINDOW_MINUTES * 60 * 1000);
      const recent = await app.prisma.emailVerificationToken.count({
        where: { userId: user.id, createdAt: { gt: since } },
      });
      if (recent >= VERIFICATION_EMAIL_MAX) {
        throw new AppError(429, "RATE_LIMITED", "Wait before requesting another verification message.");
      }
      const token = randomToken(24);
      const now = new Date();
      await app.prisma.$transaction(async (tx) => {
        await tx.emailVerificationToken.updateMany({
          where: { userId: user.id, usedAt: null },
          data: { usedAt: now },
        });
        await tx.emailVerificationToken.create({
          data: {
            userId: user.id,
            tokenHash: sha256(token),
            expiresAt: new Date(now.getTime() + EMAIL_VERIFICATION_TTL_HOURS * 60 * 60 * 1000),
          },
        });
      });
      await sendVerificationMessage(app, user.id, user.email, token);
      return { sent: true, devVerificationToken: isTestMode() ? token : undefined };
    },
  );

  app.post("/auth/password", { config: { rateLimit: { max: 8, timeWindow: "15 minutes" } } }, async (request) => {
    const user = await requireUser(request);
    const parsed = z
      .object({
        currentPassword: z.string().min(1, "Enter your current password."),
        newPassword: passwordSchema,
      })
      .safeParse(request.body);
    if (!parsed.success) throw fromZod(parsed.error);
    const record = await app.prisma.user.findUnique({ where: { id: user.id } });
    const valid = record ? await verifyPassword(record.passwordHash, parsed.data.currentPassword) : false;
    if (!record || !valid) throw new AppError(400, "INVALID_CREDENTIALS", "Current password is incorrect.");
    if (parsed.data.currentPassword === parsed.data.newPassword) {
      throw new AppError(400, "VALIDATION_ERROR", "Choose a different password.");
    }
    const passwordHash = await hashPassword(parsed.data.newPassword);
    const currentHash = request.cookies.digi_session ? sha256(request.cookies.digi_session) : null;
    await app.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: user.id }, data: { passwordHash } });
      await tx.session.updateMany({
        where: { userId: user.id, revokedAt: null, ...(currentHash ? { NOT: { tokenHash: currentHash } } : {}) },
        data: { revokedAt: new Date() },
      });
      await audit(tx, { actorUserId: user.id, action: "user.password_changed", entityType: "user", entityId: user.id });
    });
    await deliverEmail(app.prisma, {
      to: user.email,
      templateId: "password_changed",
      variables: {},
      idempotencyKey: `password-changed:${user.id}:${Date.now()}`,
      relatedType: "user",
      relatedId: user.id,
    });
    return { ok: true };
  });

  app.post(
    "/auth/forgot-password",
    { config: { rateLimit: { max: 8, timeWindow: "15 minutes" } } },
    async (request) => {
      const parsed = z.object({ email: z.string().trim().email("Enter a valid email address.") }).safeParse(request.body);
      if (!parsed.success) throw fromZod(parsed.error);
      const email = parsed.data.email.toLowerCase();
      const token = randomToken();
      const tokenHash = sha256(token);
      const user = await app.prisma.user.findUnique({ where: { email } });
      if (user) {
        const since = new Date(Date.now() - VERIFICATION_EMAIL_WINDOW_MINUTES * 60 * 1000);
        const recent = await app.prisma.passwordResetToken.count({
          where: { userId: user.id, createdAt: { gt: since } },
        });
        if (recent < PASSWORD_RESET_MAX) {
          const now = new Date();
          await app.prisma.$transaction(async (tx) => {
            await tx.passwordResetToken.updateMany({
              where: { userId: user.id, usedAt: null },
              data: { usedAt: now },
            });
            await tx.passwordResetToken.create({
              data: {
                userId: user.id,
                tokenHash,
                expiresAt: new Date(now.getTime() + PASSWORD_RESET_TTL_MINUTES * 60 * 1000),
              },
            });
          });
          await deliverEmail(app.prisma, {
            to: email,
            templateId: "password_reset",
            variables: { code: token, link: `${env.WEB_ORIGIN}/reset-password?token=${encodeURIComponent(token)}` },
            idempotencyKey: `reset:${user.id}:${tokenHash.slice(0, 16)}`,
            relatedType: "user",
            relatedId: user.id,
          });
        }
      }
      return { status: "accepted", message: RESET_MESSAGE };
    },
  );

  app.post(
    "/auth/reset-password",
    { config: { rateLimit: { max: 10, timeWindow: "15 minutes" } } },
    async (request) => {
      const parsed = z
        .object({
          token: z.string().min(20, "That password reset link is invalid or expired."),
          password: passwordSchema,
        })
        .safeParse(request.body);
      if (!parsed.success) throw fromZod(parsed.error);
      const row = await app.prisma.passwordResetToken.findUnique({ where: { tokenHash: sha256(parsed.data.token) } });
      if (!row || row.usedAt || row.expiresAt.getTime() < Date.now()) {
        throw new AppError(400, "INVALID_TOKEN", "That password reset link is invalid or expired.");
      }
      const passwordHash = await hashPassword(parsed.data.password);
      const now = new Date();
      const user = await app.prisma.$transaction(async (tx) => {
        const saved = await tx.user.update({ where: { id: row.userId }, data: { passwordHash } });
        await tx.passwordResetToken.update({ where: { id: row.id }, data: { usedAt: now } });
        await tx.passwordResetToken.updateMany({
          where: { userId: row.userId, usedAt: null },
          data: { usedAt: now },
        });
        await tx.session.updateMany({
          where: { userId: row.userId, revokedAt: null },
          data: { revokedAt: now },
        });
        await audit(tx, { actorUserId: saved.id, action: "user.password_reset", entityType: "user", entityId: saved.id });
        return saved;
      });
      await deliverEmail(app.prisma, {
        to: user.email,
        templateId: "password_changed",
        variables: {},
        idempotencyKey: `password-reset-notice:${user.id}:${Date.now()}`,
        relatedType: "user",
        relatedId: user.id,
      });
      return { ok: true };
    },
  );
}

async function sendVerificationMessage(app: FastifyInstance, userId: string, email: string, token: string) {
  const link = `${env.WEB_ORIGIN}/verify-email?token=${encodeURIComponent(token)}`;
  await deliverEmail(app.prisma, {
    to: email,
    templateId: "email_verification",
    variables: { code: token, link },
    idempotencyKey: `verify:${userId}:${sha256(token).slice(0, 16)}`,
    relatedType: "user",
    relatedId: userId,
  });
}
