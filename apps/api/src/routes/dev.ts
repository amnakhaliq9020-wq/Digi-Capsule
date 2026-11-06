import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { verificationReducer, type AttestationPosition, type VerificationState } from "@digi/domain";
import { COOLING_OFF_DAYS, QUORUM_REQUIRED } from "@digi/shared";
import { requireUser } from "../auth";
import { isTestMode, isVerificationReleaseEnabled } from "../env";
import { AppError, fromZod } from "../errors";
import { currentInstant, setSimulatedNow } from "../lib/clock";
import { runWorkerTick } from "../services/worker-tick";

const DAY_MS = 24 * 60 * 60 * 1000;
const TERMINAL = ["recovered", "cancelled", "released"] as const;

function assertTestConsole() {
  if (!isTestMode()) throw new AppError(404, "NOT_FOUND", "Not found.");
}

export async function devRoutes(app: FastifyInstance) {
  app.get("/dev/clock", async (request) => {
    assertTestConsole();
    await requireUser(request);
    return {
      testMode: true,
      simulatedNow: await currentInstant(app.prisma),
      verificationReleasesEnabled: isVerificationReleaseEnabled(),
      productionReleaseLocked: true,
    };
  });

  app.post("/dev/clock", async (request) => {
    assertTestConsole();
    await requireUser(request);
    const parsed = z
      .object({
        simulatedNow: z.string().datetime().optional(),
        advanceDays: z.number().optional(),
        advanceMinutes: z.number().optional(),
      })
      .safeParse(request.body ?? {});
    if (!parsed.success) throw fromZod(parsed.error);
    const current = await currentInstant(app.prisma);
    let next = parsed.data.simulatedNow ? new Date(parsed.data.simulatedNow) : current;
    if (parsed.data.advanceDays) next = new Date(next.getTime() + parsed.data.advanceDays * DAY_MS);
    if (parsed.data.advanceMinutes) next = new Date(next.getTime() + parsed.data.advanceMinutes * 60 * 1000);
    if (Number.isNaN(next.getTime())) throw new AppError(400, "VALIDATION_ERROR", "Choose a valid simulated time.");
    return { simulatedNow: await setSimulatedNow(app.prisma, next) };
  });

  app.post("/dev/worker/tick", async (request) => {
    assertTestConsole();
    await requireUser(request);
    return runWorkerTick(app.prisma);
  });

  app.get("/dev/inbox", async (request) => {
    assertTestConsole();
    await requireUser(request);
    const messages = await app.prisma.devMessage.findMany({ orderBy: { createdAt: "desc" }, take: 100 });
    return { messages };
  });

  app.post("/dev/verification/cases", async (request, reply) => {
    assertTestConsole();
    const user = await requireUser(request);
    const parsed = z.object({ verifierPersonId: z.string().uuid() }).safeParse(request.body);
    if (!parsed.success) throw fromZod(parsed.error);
    const person = await app.prisma.person.findFirst({
      where: { id: parsed.data.verifierPersonId, ownerUserId: user.id },
      include: { roles: true },
    });
    const role = person?.roles.find((entry) => entry.role === "verifier" && !entry.revokedAt && entry.channelVerifiedAt);
    if (!person || !role) {
      throw new AppError(400, "VERIFIER_NOT_READY", "Choose a verified verifier. One person cannot authorize a release alone.");
    }
    const existing = await app.prisma.verificationCase.findFirst({
      where: { subjectUserId: user.id, state: { notIn: [...TERMINAL] } },
    });
    if (existing) throw new AppError(409, "CASE_OPEN", "A release review is already open.");
    const opened = verificationReducer("none", { type: "verifier_opens_case" });
    const collecting = verificationReducer(opened.state, { type: "case_acknowledged" });
    const verifiers = await app.prisma.contactRole.count({
      where: { role: "verifier", revokedAt: null, channelVerifiedAt: { not: null }, person: { ownerUserId: user.id } },
    });
    const now = await currentInstant(app.prisma);
    const created = await app.prisma.verificationCase.create({
      data: {
        subjectUserId: user.id,
        state: collecting.state as Exclude<VerificationState, "none">,
        openedByPersonId: person.id,
        quorumRequired: QUORUM_REQUIRED,
        quorumOf: verifiers,
        openedAt: now,
      },
    });
    return reply.code(201).send({ case: created });
  });

  app.post("/dev/verification/cases/:id/attestations", async (request) => {
    assertTestConsole();
    const user = await requireUser(request);
    const { id } = request.params as { id: string };
    const parsed = z
      .object({
        personId: z.string().uuid(),
        position: z.enum(["believe_deceased", "reached_alive", "unknown", "dispute"]),
        note: z.string().max(500).optional(),
      })
      .safeParse(request.body);
    if (!parsed.success) throw fromZod(parsed.error);
    const review = await app.prisma.verificationCase.findFirst({ where: { id, subjectUserId: user.id } });
    if (!review) throw new AppError(404, "NOT_FOUND", "Review not found.");
    const person = await app.prisma.person.findFirst({
      where: { id: parsed.data.personId, ownerUserId: user.id },
      include: { roles: true },
    });
    const allowed = person?.roles.some((role) => !role.revokedAt && role.channelVerifiedAt && (role.role === "verifier" || role.role === "trusted_contact"));
    if (!person || !allowed) throw new AppError(403, "FORBIDDEN", "This contact cannot make a statement on the review.");
    const now = await currentInstant(app.prisma);
    await app.prisma.attestation.upsert({
      where: { caseId_personId: { caseId: review.id, personId: person.id } },
      create: { caseId: review.id, personId: person.id, position: parsed.data.position, note: parsed.data.note, attestedAt: now },
      update: { position: parsed.data.position, note: parsed.data.note, attestedAt: now, withdrawnAt: null },
    });
    const believeCount = await app.prisma.attestation.count({
      where: { caseId: review.id, position: "believe_deceased", withdrawnAt: null },
    });
    const coolingStarted = review.state === "cooling_off" || review.state === "cancellation_window" || review.state === "release_authorized";
    const next = verificationReducer(review.state as VerificationState, {
      type: "attestation_recorded",
      position: parsed.data.position as AttestationPosition,
      believeCount,
      quorumRequired: review.quorumRequired,
      coolingOffStarted: coolingStarted,
    });
    const coolingOffEndsAt =
      next.state === "cooling_off" && review.state !== "cooling_off"
        ? new Date(now.getTime() + COOLING_OFF_DAYS * DAY_MS)
        : review.coolingOffEndsAt;
    const updated = await app.prisma.verificationCase.update({
      where: { id: review.id },
      data: {
        state: next.state as Exclude<VerificationState, "none">,
        coolingOffEndsAt,
        resolution: next.state === "disputed" ? "disputed_blocked" : review.resolution,
      },
    });
    return { case: updated, believeCount };
  });
}
