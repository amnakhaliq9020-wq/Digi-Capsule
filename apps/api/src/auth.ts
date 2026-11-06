import type { FastifyReply, FastifyRequest } from "fastify";
import { AppError } from "./errors";
import { sha256 } from "./lib/crypto";

export type AuthUser = {
  id: string;
  email: string;
  emailVerifiedAt: Date | null;
  displayName: string;
  timeZone: string;
};

export async function requireUser(request: FastifyRequest): Promise<AuthUser> {
  const token = request.cookies.digi_session;
  if (!token) throw new AppError(401, "UNAUTHORIZED", "Sign in to continue.");
  const session = await request.server.prisma.session.findUnique({
    where: { tokenHash: sha256(token) },
    include: { user: { include: { profile: true } } },
  });
  if (!session || session.revokedAt || session.expiresAt.getTime() <= Date.now()) {
    throw new AppError(401, "UNAUTHORIZED", "Your session has ended. Sign in again.");
  }
  if (!session.user.profile) throw new AppError(401, "UNAUTHORIZED", "Sign in to continue.");
  return {
    id: session.user.id,
    email: session.user.email,
    emailVerifiedAt: session.user.emailVerifiedAt,
    displayName: session.user.profile.displayName,
    timeZone: session.user.profile.timeZone,
  };
}

export function setSessionCookie(reply: FastifyReply, token: string, maxAgeSeconds: number) {
  reply.setCookie("digi_session", token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: maxAgeSeconds,
  });
}

export function clearSessionCookie(reply: FastifyReply) {
  reply.clearCookie("digi_session", { path: "/" });
}
