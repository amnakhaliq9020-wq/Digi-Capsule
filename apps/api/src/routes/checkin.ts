import type { FastifyInstance } from "fastify";
import { resolveWarningStage } from "@digi/shared";
import { requireUser } from "../auth";
import { AppError } from "../errors";
import { currentInstant } from "../lib/clock";
import { confirmAlive } from "../services/account";
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
      where: { userId: user.id, state: "confirmed" },
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
      lastCheckInAt: last?.confirmedAt ?? null,
      nextCheckInDueAt: policy?.nextDueAt ?? null,
      status: overdue.overdue ? "overdue" : "on_time",
      warningStage,
      daysOverdue: overdue.overdue ? overdue.daysOverdue : 0,
      intervalDays: policy?.intervalDays ?? 30,
      pausedUntil: policy?.pausedUntil ?? null,
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
}
