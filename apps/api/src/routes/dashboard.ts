import type { FastifyInstance } from "fastify";
import { resolveWarningStage } from "@digi/shared";
import { requireUser } from "../auth";
import { currentInstant } from "../lib/clock";

export async function dashboardRoutes(app: FastifyInstance) {
  app.get("/dashboard", async (request) => {
    const user = await requireUser(request);
    const now = await currentInstant(app.prisma);
    const items = await app.prisma.capsuleItem.findMany({
      where: { capsule: { ownerUserId: user.id }, status: { not: "cancelled" } },
      include: { releaseRules: { where: { status: "active" } } },
    });
    const drafts = items.filter((item) => item.status === "draft").length;
    const onDate = items.filter((item) => item.releaseRules.some((rule) => rule.trigger === "exact_time")).length;
    const ifIAmGone = items.filter((item) => item.releaseRules.some((rule) => rule.trigger === "after_verification")).length;
    const upcoming = items
      .flatMap((item) => item.releaseRules)
      .filter((rule) => rule.trigger === "exact_time" && rule.nextRunAt && rule.nextRunAt >= now)
      .sort((a, b) => a.nextRunAt!.getTime() - b.nextRunAt!.getTime())[0];
    const policy = await app.prisma.checkInPolicy.findUnique({ where: { userId: user.id } });
    const last = await app.prisma.checkInCycle.findFirst({
      where: { userId: user.id, state: "confirmed" },
      orderBy: { confirmedAt: "desc" },
    });
    const cycle = await app.prisma.checkInCycle.findFirst({
      where: { userId: user.id, state: { in: ["due", "reminded", "missed_unreachable"] } },
      orderBy: { dueAt: "desc" },
      include: { events: true },
    });
    const warningStatus = resolveWarningStage({
      overdue: Boolean(cycle && cycle.dueAt <= now),
      cycleState: cycle?.state,
      events: cycle?.events ?? [],
    });
    return {
      totalMemories: items.length,
      drafts,
      scheduled: onDate,
      ifIAmGone,
      nextScheduledDelivery: upcoming?.nextRunAt ?? null,
      lastCheckInAt: last?.confirmedAt ?? null,
      nextCheckInDueAt: policy?.nextDueAt ?? null,
      warningStatus,
      serverTime: now,
    };
  });

  app.get("/deliveries", async (request) => {
    const user = await requireUser(request);
    const jobs = await app.prisma.releaseJob.findMany({
      where: { item: { capsule: { ownerUserId: user.id } } },
      include: { person: true, item: true, rule: true },
      orderBy: { createdAt: "desc" },
    });
    return {
      deliveries: jobs.map((job) => ({
        id: job.id,
        status: job.status,
        occurrenceAt: job.occurrenceAt,
        sentAt: job.sentAt,
        memoryId: job.item.id,
        memoryTitle: job.item.title,
        recipient: { id: job.person.id, displayName: job.person.displayName, email: job.person.email },
        trigger: job.rule?.trigger ?? (job.verificationCaseId ? "after_verification" : null),
      })),
    };
  });
}
