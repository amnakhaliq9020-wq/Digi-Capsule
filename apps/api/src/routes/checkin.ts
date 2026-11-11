import type { FastifyInstance } from "fastify";
import { resolveWarningStage } from "@digi/shared";
import { requireUser } from "../auth";
import { AppError } from "../errors";
import { currentInstant } from "../lib/clock";
import { confirmAlive, confirmAliveFromToken } from "../services/account";
import { sha256 } from "../lib/crypto";
import { z } from "zod";
import { overdueLabel } from "../services/worker-tick";

const OPEN_STATES = ["open", "collecting", "cooling_off", "cancellation_window", "release_authorized", "releasing", "disputed"] as const;

export async function checkInRoutes(app: FastifyInstance) {
  app.get("/check-in", async (request) => {
    const user = await requireUser(request);
    const now = await currentInstant(app.prisma);
    const policy = await app.prisma.checkInPolicy.findUnique({ where: { userId: user.id } });
    const cycle = await app.prisma.checkInCycle.findFirst({
      where: { userId: user.id, state: { in: ["due", "reminded", "missed_unreachable"] } },
      orderBy: { dueAt: "desc" },
      include: { events: { orderBy: { at: "asc" } } },
    });
    const last = await app.prisma.checkInCycle.findFirst({
      where: { userId: user.id, state: "confirmed", confirmedAt: { lte: now } },
      orderBy: { confirmedAt: "desc" },
    });
    const review = await app.prisma.verificationCase.findFirst({
      where: { subjectUserId: user.id, state: { in: [...OPEN_STATES] } },
      orderBy: { openedAt: "desc" },
    });
    const overdue = cycle ? overdueLabel(cycle.dueAt, now) : { overdue: false, daysOverdue: 0 };
    const warningStage = resolveWarningStage({
      overdue: overdue.overdue,
      cycleState: cycle?.state,
      events: cycle?.events ?? [],
    });
    return {
      lastCheckInAt: policy?.lastConfirmedAt ?? last?.confirmedAt ?? null,
      nextCheckInDueAt: policy?.nextCheckAt ?? policy?.nextDueAt ?? null,
      status: overdue.overdue ? "overdue" : "on_time",
      warningStage,
      daysOverdue: overdue.overdue ? overdue.daysOverdue : 0,
      intervalDays: policy?.intervalDays ?? 30,
      pausedUntil: policy?.pausedUntil ?? null,
      accountCheckStatus: policy?.accountCheckStatus ?? "on_time",
      escalationStatus: policy?.escalationStatus ?? "none",
      confirmationRequestedAt: policy?.confirmationRequestedAt ?? null,
      confirmationDeadline: policy?.confirmationDeadline ?? null,
      lastNotificationSentAt: policy?.lastNotificationSentAt ?? null,
      timeZone: user.timeZone,
      review: review
        ? {
            id: review.id,
            state: review.state,
            label: "A release review is in progress. Confirming you are reachable will stop it. Nothing will be sent by that confirmation.",
          }
        : null,
      events: (cycle?.events ?? []).map((event) => ({
        id: event.id,
        type: event.type,
        offsetDays: event.offsetDays,
        at: event.at,
      })),
    };
  });

  app.post("/check-in", async (request) => {
    const user = await requireUser(request);
    try {
      const result = await confirmAlive(app.prisma, user.id);
      return {
        confirmedAt: result.confirmedAt,
        nextCheckInDueAt: result.nextDueAt,
        reviewStopped: result.reviewStopped,
        message: "Check-in recorded. This did not send any memories.",
      };
    } catch (error) {
      if (error instanceof Error && error.message === "NO_OPEN_CYCLE") {
        throw new AppError(409, "NO_OPEN_CYCLE", "There is no open check-in to confirm.");
      }
      throw error;
    }
  });

  app.post("/check-in/confirm", { config: { rateLimit: { max: 8, timeWindow: "15 minutes" } } }, async (request) => {
    const parsed = z.object({ token: z.string().min(20).max(200) }).safeParse(request.body);
    if (!parsed.success) throw new AppError(400, "VALIDATION_ERROR", "Enter the confirmation link from the email.");
    try {
      const result = await confirmAliveFromToken(app.prisma, sha256(parsed.data.token));
      return {
        confirmedAt: result.confirmedAt,
        nextCheckInDueAt: result.nextDueAt,
        escalationCancelled: result.escalationCancelled,
        message: "Check-in recorded. This did not send any memories.",
      };
    } catch (error) {
      if (error instanceof Error && error.message === "TOKEN_EXPIRED") {
        throw new AppError(400, "TOKEN_EXPIRED", "This confirmation link has expired. Sign in and press I'm Alive.");
      }
      if (error instanceof Error && error.message === "TOKEN_INVALID") {
        throw new AppError(400, "TOKEN_INVALID", "This confirmation link cannot be used.");
      }
      if (error instanceof Error && error.message === "NO_OPEN_CYCLE") {
        throw new AppError(409, "NO_OPEN_CYCLE", "There is no open check-in to confirm.");
      }
      throw error;
    }
  });

  app.post("/check-in/pause", async (request) => {
    const user = await requireUser(request);
    const now = await currentInstant(app.prisma);
    const until = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    await app.prisma.checkInPolicy.update({
      where: { userId: user.id },
      data: { pausedUntil: until, accountCheckStatus: "paused" },
    });
    return {
      pausedUntil: until,
      message: "Check-in warnings are paused for 30 days. This does not send or release any memories.",
    };
  });

  app.post("/check-in/resume", async (request) => {
    const user = await requireUser(request);
    const now = await currentInstant(app.prisma);
    const policy = await app.prisma.checkInPolicy.findUniqueOrThrow({ where: { userId: user.id } });
    const awaiting = policy.confirmationRequestedAt && (!policy.confirmationDeadline || policy.confirmationDeadline > now);
    await app.prisma.checkInPolicy.update({
      where: { userId: user.id },
      data: {
        pausedUntil: null,
        accountCheckStatus: policy.escalationStatus === "pending" ? "escalation_pending" : awaiting ? "awaiting_confirmation" : "on_time",
      },
    });
    return { message: "Check-in warnings are active again. This does not send any memories." };
  });
}
