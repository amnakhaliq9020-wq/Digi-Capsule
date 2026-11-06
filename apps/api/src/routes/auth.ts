import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { LOGIN_MAX_FAILURES, LOGIN_WINDOW_MINUTES, SESSION_TTL_HOURS } from "@digi/shared";
import { clearSessionCookie, requireUser, setSessionCookie } from "../auth";
import { isTestMode } from "../env";
import { AppError, fromZod, isUniqueViolation } from "../errors";
import { audit } from "../lib/audit";
import { randomToken, sha256 } from "../lib/crypto";
import { deliverEmail } from "../lib/notify";
import { hashPassword, verifyPassword } from "../lib/passwords";
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
      await deliverEmail(app.prisma, {
        to: email,
        templateId: "email_verification",
        variables: { code: token },
        idempotencyKey: `verify:${user.id}:${token.slice(0, 8)}`,
        relatedType: "user",
        relatedId: user.id,
      });
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
    const valid = user ? await verifyPassword(user.passwordHash, parsed.data.password) : false;
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

  app.post("/auth/verify-email", async (request) => {
    const user = await requireUser(request);
    const parsed = z.object({ token: z.string().min(10, "Enter the verification code.") }).safeParse(request.body);
    if (!parsed.success) throw fromZod(parsed.error);
    const row = await app.prisma.emailVerificationToken.findUnique({ where: { tokenHash: sha256(parsed.data.token) } });
    if (!row || row.userId !== user.id || row.usedAt || row.expiresAt.getTime() < Date.now()) {
      throw new AppError(400, "INVALID_TOKEN", "That verification code is invalid or expired.");
    }
    await app.prisma.emailVerificationToken.update({ where: { id: row.id }, data: { usedAt: new Date() } });
    await app.prisma.user.update({ where: { id: user.id }, data: { emailVerifiedAt: new Date() } });
    return { emailVerified: true };
  });
}
