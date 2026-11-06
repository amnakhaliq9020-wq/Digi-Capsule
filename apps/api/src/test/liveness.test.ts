import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { runWorkerTick } from "../services/worker-tick";
import { addVerifiedContact, createApp, registerUser, resetDatabase, verifyEmail } from "./helpers";

const app = await createApp();
afterAll(async () => app.close());
beforeEach(async () => {
  process.env.VERIFICATION_RELEASES_ENABLED = "false";
  process.env.DIGI_TEST_MODE = "true";
  process.env.NODE_ENV = "test";
  await resetDatabase(app);
});

async function authorWithMemory(email: string) {
  const author = await registerUser(app, email, "Case Author");
  await verifyEmail(app, author.cookie, author.token);
  const recipient = await addVerifiedContact(app, author.cookie, { displayName: "Recipient", email: `to-${email}` });
  const created = await app.inject({
    method: "POST",
    url: "/v1/memories",
    headers: { cookie: author.cookie },
    payload: { title: "If needed", body: "PRIVATE_GONE_LETTER" },
  });
  return { author, recipient, memoryId: created.json().memory.id as string };
}

describe("check-in and test-only release", () => {
  it("records I'm Alive without sending a memory", async () => {
    const { author, recipient, memoryId } = await authorWithMemory("alive@example.test");
    await app.inject({
      method: "POST",
      url: `/v1/memories/${memoryId}/schedule`,
      headers: { cookie: author.cookie },
      payload: { mode: "if_i_am_gone", recipientIds: [recipient.id] },
    });
    const before = await app.prisma.releaseJob.count();
    const check = await app.inject({ method: "POST", url: "/v1/check-in", headers: { cookie: author.cookie } });
    expect(check.statusCode).toBe(200);
    expect(check.json().message).toMatch(/did not send/i);
    expect(await app.prisma.releaseJob.count()).toBe(before);
    expect(await app.prisma.notificationDelivery.count({ where: { templateId: "memory_ready" } })).toBe(0);
    const events = await app.prisma.checkInEvent.findMany({ where: { type: "confirmed" } });
    expect(events).toHaveLength(1);
  });

  it("escalates warnings without delivering a memory or duplicating reminders", async () => {
    const { author, recipient, memoryId } = await authorWithMemory("warnings@example.test");
    const trusted = await addVerifiedContact(app, author.cookie, {
      displayName: "Trusted",
      email: "trusted@example.test",
      roles: ["trusted_contact"],
    });
    await app.inject({
      method: "POST",
      url: `/v1/memories/${memoryId}/schedule`,
      headers: { cookie: author.cookie },
      payload: { mode: "if_i_am_gone", recipientIds: [recipient.id] },
    });
    const cycle = await app.prisma.checkInCycle.findFirstOrThrow({ where: { state: "due" } });
    const stages: { day: number; stage: string }[] = [
      { day: 0, stage: "missed_check_in" },
      { day: 3, stage: "missed_check_in" },
      { day: 7, stage: "second_warning" },
      { day: 14, stage: "final_warning" },
      { day: 21, stage: "simulated_conditional_release" },
    ];
    for (const step of stages) {
      await app.inject({
        method: "POST",
        url: "/v1/dev/clock",
        headers: { cookie: author.cookie },
        payload: { simulatedNow: new Date(cycle.dueAt.getTime() + step.day * 24 * 60 * 60 * 1000).toISOString() },
      });
      await app.inject({ method: "POST", url: "/v1/dev/worker/tick", headers: { cookie: author.cookie } });
      expect(await app.prisma.releaseJob.count()).toBe(0);
      const midway = await app.inject({ method: "GET", url: "/v1/check-in", headers: { cookie: author.cookie } });
      expect(midway.json().warningStage).toBe(step.stage);
    }
    process.env.VERIFICATION_RELEASES_ENABLED = "true";
    await app.inject({ method: "POST", url: "/v1/dev/worker/tick", headers: { cookie: author.cookie } });
    process.env.VERIFICATION_RELEASES_ENABLED = "false";
    const reminders = await app.prisma.notificationDelivery.findMany({
      where: { templateId: { in: ["check_in_due", "check_in_reminder"] } },
    });
    expect(reminders).toHaveLength(3);
    const simulated = await app.prisma.notificationDelivery.findMany({ where: { templateId: "simulated_conditional_release" } });
    expect(simulated).toHaveLength(1);
    const notice = await app.prisma.notificationDelivery.findMany({ where: { templateId: "trusted_contact_unreachable" } });
    expect(notice).toHaveLength(1);
    const status = await app.inject({ method: "GET", url: "/v1/check-in", headers: { cookie: author.cookie } });
    expect(status.json().warningStage).toBe("simulated_conditional_release");
    const eventTypes = status.json().events.map((event: { type: string }) => event.type);
    expect(eventTypes.slice(0, 3)).toEqual(["notice_sent", "reminder_sent", "reminder_sent"]);
    expect(eventTypes).toHaveLength(5);
    expect(eventTypes).toEqual(expect.arrayContaining(["simulated_release_recorded", "unreachable_notice_sent"]));
    expect(status.json().events.length).toBeGreaterThan(0);
    expect(trusted.id).toBeTruthy();
    const inbox = await app.prisma.devMessage.findMany();
    expect(JSON.stringify(inbox)).not.toContain("PRIVATE_GONE_LETTER");
    expect(JSON.stringify(inbox)).toContain("does not mean they have died");
    expect(JSON.stringify(inbox)).toContain("not proof of death");
    expect(JSON.stringify(inbox)).not.toContain("second warning, 3 days");
    expect(JSON.stringify(inbox)).not.toMatch(/has died|is deceased|we have determined/i);
  });

  it("stops a review when the author checks in", async () => {
    const { author, recipient, memoryId } = await authorWithMemory("recover@example.test");
    const verifierA = await addVerifiedContact(app, author.cookie, {
      displayName: "Verifier A",
      email: "verifier-a@example.test",
      roles: ["verifier"],
    });
    await addVerifiedContact(app, author.cookie, {
      displayName: "Verifier B",
      email: "verifier-b@example.test",
      roles: ["verifier"],
    });
    await app.inject({
      method: "POST",
      url: `/v1/memories/${memoryId}/schedule`,
      headers: { cookie: author.cookie },
      payload: { mode: "if_i_am_gone", recipientIds: [recipient.id] },
    });
    const opened = await app.inject({
      method: "POST",
      url: "/v1/dev/verification/cases",
      headers: { cookie: author.cookie },
      payload: { verifierPersonId: verifierA.id },
    });
    const caseId = opened.json().case.id as string;
    const one = await app.inject({
      method: "POST",
      url: `/v1/dev/verification/cases/${caseId}/attestations`,
      headers: { cookie: author.cookie },
      payload: { personId: verifierA.id, position: "believe_deceased" },
    });
    expect(one.json().case.state).toBe("collecting");
    const alive = await app.inject({ method: "POST", url: "/v1/check-in", headers: { cookie: author.cookie } });
    expect(alive.json().reviewStopped).toBe(true);
    const review = await app.prisma.verificationCase.findUniqueOrThrow({ where: { id: caseId } });
    expect(review.state).toBe("recovered");
    process.env.VERIFICATION_RELEASES_ENABLED = "true";
    await app.inject({ method: "POST", url: "/v1/dev/worker/tick", headers: { cookie: author.cookie } });
    expect(await app.prisma.releaseJob.count()).toBe(0);
  });

  it("releases only the authorized memory in test mode and does not duplicate it", async () => {
    const { author, memoryId } = await authorWithMemory("release@example.test");
    const recipientA = await addVerifiedContact(app, author.cookie, { displayName: "A", email: "recv-a@example.test" });
    const recipientB = await addVerifiedContact(app, author.cookie, { displayName: "B", email: "recv-b@example.test" });
    const verifierA = await addVerifiedContact(app, author.cookie, {
      displayName: "Verifier A",
      email: "rel-a@example.test",
      roles: ["verifier"],
    });
    const verifierB = await addVerifiedContact(app, author.cookie, {
      displayName: "Verifier B",
      email: "rel-b@example.test",
      roles: ["verifier"],
    });
    const second = await app.inject({
      method: "POST",
      url: "/v1/memories",
      headers: { cookie: author.cookie },
      payload: { title: "Other", body: "OTHER_PRIVATE" },
    });
    const otherId = second.json().memory.id as string;
    await app.inject({
      method: "POST",
      url: `/v1/memories/${memoryId}/schedule`,
      headers: { cookie: author.cookie },
      payload: { mode: "if_i_am_gone", recipientIds: [recipientA.id] },
    });
    await app.inject({
      method: "POST",
      url: `/v1/memories/${otherId}/schedule`,
      headers: { cookie: author.cookie },
      payload: { mode: "if_i_am_gone", recipientIds: [recipientB.id] },
    });
    const opened = await app.inject({
      method: "POST",
      url: "/v1/dev/verification/cases",
      headers: { cookie: author.cookie },
      payload: { verifierPersonId: verifierA.id },
    });
    expect(opened.statusCode).toBe(201);
    const caseId = opened.json().case.id as string;
    await app.inject({
      method: "POST",
      url: `/v1/dev/verification/cases/${caseId}/attestations`,
      headers: { cookie: author.cookie },
      payload: { personId: verifierA.id, position: "believe_deceased" },
    });
    const quorum = await app.inject({
      method: "POST",
      url: `/v1/dev/verification/cases/${caseId}/attestations`,
      headers: { cookie: author.cookie },
      payload: { personId: verifierB.id, position: "believe_deceased" },
    });
    expect(quorum.json().case.state).toBe("cooling_off");
    const coolingEnd = new Date(quorum.json().case.coolingOffEndsAt);
    await app.inject({
      method: "POST",
      url: "/v1/dev/clock",
      headers: { cookie: author.cookie },
      payload: { simulatedNow: new Date(coolingEnd.getTime() + 60 * 1000).toISOString() },
    });
    process.env.VERIFICATION_RELEASES_ENABLED = "false";
    await app.inject({ method: "POST", url: "/v1/dev/worker/tick", headers: { cookie: author.cookie } });
    expect(await app.prisma.releaseJob.count()).toBe(0);
    const waiting = await app.prisma.verificationCase.findUniqueOrThrow({ where: { id: caseId } });
    expect(waiting.state).toBe("cancellation_window");
    await app.inject({
      method: "POST",
      url: "/v1/dev/clock",
      headers: { cookie: author.cookie },
      payload: { simulatedNow: new Date(waiting.cancellationWindowEndsAt!.getTime() + 60 * 1000).toISOString() },
    });
    await app.inject({ method: "POST", url: "/v1/dev/worker/tick", headers: { cookie: author.cookie } });
    const authorized = await app.prisma.verificationCase.findUniqueOrThrow({ where: { id: caseId } });
    expect(authorized.state).toBe("release_authorized");
    expect(await app.prisma.releaseJob.count()).toBe(0);
    process.env.VERIFICATION_RELEASES_ENABLED = "true";
    const released = await app.inject({ method: "POST", url: "/v1/dev/worker/tick", headers: { cookie: author.cookie } });
    expect(released.json().verificationJobsSent).toBe(2);
    await app.inject({ method: "POST", url: "/v1/dev/worker/tick", headers: { cookie: author.cookie } });
    const jobs = await app.prisma.releaseJob.findMany();
    expect(jobs).toHaveLength(2);
    expect(jobs.every((job) => job.status === "sent")).toBe(true);
    const forA = jobs.find((job) => job.personId === recipientA.id);
    const forB = jobs.find((job) => job.personId === recipientB.id);
    expect(forA?.capsuleItemId).toBe(memoryId);
    expect(forB?.capsuleItemId).toBe(otherId);
    const messages = await app.prisma.devMessage.findMany({ where: { templateId: "memory_ready" } });
    expect(messages).toHaveLength(2);
    expect(JSON.stringify(messages)).not.toContain("PRIVATE_GONE_LETTER");
    expect(JSON.stringify(messages)).not.toContain("OTHER_PRIVATE");
  });

  it("keeps an authorized review retryable when no delivery was queued", async () => {
    const { author, recipient, memoryId } = await authorWithMemory("retry-release@example.test");
    await app.inject({
      method: "POST",
      url: `/v1/memories/${memoryId}/schedule`,
      headers: { cookie: author.cookie },
      payload: { mode: "if_i_am_gone", recipientIds: [recipient.id] },
    });
    const verifierA = await addVerifiedContact(app, author.cookie, {
      displayName: "Verifier A",
      email: "retry-a@example.test",
      roles: ["verifier"],
    });
    const verifierB = await addVerifiedContact(app, author.cookie, {
      displayName: "Verifier B",
      email: "retry-b@example.test",
      roles: ["verifier"],
    });
    const opened = await app.inject({
      method: "POST",
      url: "/v1/dev/verification/cases",
      headers: { cookie: author.cookie },
      payload: { verifierPersonId: verifierA.id },
    });
    const caseId = opened.json().case.id as string;
    await app.inject({
      method: "POST",
      url: `/v1/dev/verification/cases/${caseId}/attestations`,
      headers: { cookie: author.cookie },
      payload: { personId: verifierA.id, position: "believe_deceased" },
    });
    const quorum = await app.inject({
      method: "POST",
      url: `/v1/dev/verification/cases/${caseId}/attestations`,
      headers: { cookie: author.cookie },
      payload: { personId: verifierB.id, position: "believe_deceased" },
    });
    const coolingEnd = new Date(quorum.json().case.coolingOffEndsAt);
    await app.inject({
      method: "POST",
      url: "/v1/dev/clock",
      headers: { cookie: author.cookie },
      payload: { simulatedNow: new Date(coolingEnd.getTime() + 60_000).toISOString() },
    });
    await app.inject({ method: "POST", url: "/v1/dev/worker/tick", headers: { cookie: author.cookie } });
    const waiting = await app.prisma.verificationCase.findUniqueOrThrow({ where: { id: caseId } });
    await app.inject({
      method: "POST",
      url: "/v1/dev/clock",
      headers: { cookie: author.cookie },
      payload: { simulatedNow: new Date(waiting.cancellationWindowEndsAt!.getTime() + 60_000).toISOString() },
    });
    await app.inject({ method: "POST", url: "/v1/dev/worker/tick", headers: { cookie: author.cookie } });
    await app.prisma.releaseRule.updateMany({ where: { capsuleItemId: memoryId }, data: { status: "paused" } });
    process.env.VERIFICATION_RELEASES_ENABLED = "true";
    await app.inject({ method: "POST", url: "/v1/dev/worker/tick", headers: { cookie: author.cookie } });
    const stuck = await app.prisma.verificationCase.findUniqueOrThrow({ where: { id: caseId } });
    expect(stuck.state).toBe("release_authorized");
    expect(await app.prisma.releaseJob.count()).toBe(0);
    await app.prisma.releaseRule.updateMany({ where: { capsuleItemId: memoryId }, data: { status: "active" } });
    const retried = await app.inject({ method: "POST", url: "/v1/dev/worker/tick", headers: { cookie: author.cookie } });
    expect(retried.json().verificationJobsSent).toBe(1);
    expect(await app.prisma.releaseJob.count()).toBe(1);
  });

  it("records the simulated release only in test mode and still sends no memory", async () => {
    const { author, recipient, memoryId } = await authorWithMemory("sim-lock@example.test");
    await app.inject({
      method: "POST",
      url: `/v1/memories/${memoryId}/schedule`,
      headers: { cookie: author.cookie },
      payload: { mode: "if_i_am_gone", recipientIds: [recipient.id] },
    });
    const cycle = await app.prisma.checkInCycle.findFirstOrThrow({ where: { state: "due" } });
    await app.inject({
      method: "POST",
      url: "/v1/dev/clock",
      headers: { cookie: author.cookie },
      payload: { simulatedNow: new Date(cycle.dueAt.getTime() + 21 * 24 * 60 * 60 * 1000).toISOString() },
    });
    process.env.NODE_ENV = "production";
    process.env.DIGI_TEST_MODE = "true";
    process.env.VERIFICATION_RELEASES_ENABLED = "true";
    try {
      const locked = await runWorkerTick(app.prisma);
      expect(locked.simulatedReleasesRecorded).toBe(0);
      expect(locked.verificationJobsSent).toBe(0);
      expect(await app.prisma.releaseJob.count()).toBe(0);
      expect(await app.prisma.checkInEvent.count({ where: { type: "simulated_release_recorded" } })).toBe(0);
    } finally {
      process.env.NODE_ENV = "test";
      process.env.DIGI_TEST_MODE = "true";
      process.env.VERIFICATION_RELEASES_ENABLED = "false";
    }
    const opened = await app.inject({ method: "POST", url: "/v1/dev/worker/tick", headers: { cookie: author.cookie } });
    expect(opened.json().simulatedReleasesRecorded).toBe(1);
    expect(opened.json().verificationJobsSent).toBe(0);
    expect(await app.prisma.releaseJob.count()).toBe(0);
  });

  it("hides the test clock outside test mode and keeps the sample flag off", async () => {
    const author = await registerUser(app, "clock@example.test");
    process.env.DIGI_TEST_MODE = "false";
    const hidden = await app.inject({
      method: "POST",
      url: "/v1/dev/clock",
      headers: { cookie: author.cookie },
      payload: { advanceDays: 30 },
    });
    expect(hidden.statusCode).toBe(404);
    process.env.DIGI_TEST_MODE = "true";
    const example = readFileSync(path.resolve(process.cwd(), "../../.env.example"), "utf8");
    expect(example).toContain("VERIFICATION_RELEASES_ENABLED=false");
  });
});
