import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { addVerifiedContact, createApp, registerUser, resetDatabase, verifyEmail } from "./helpers";

const app = await createApp();
afterAll(async () => app.close());
beforeEach(async () => resetDatabase(app));

async function schedule(cookie: string, id: string, recipientIds: string[], localDate: string) {
  return app.inject({
    method: "POST",
    url: `/v1/memories/${id}/schedule`,
    headers: { cookie },
    payload: { mode: "on_date", localDate, localTime: "09:00", timeZone: "UTC", recipientIds },
  });
}

describe("contact and memory synchronization", () => {
  it("edits a contact, rejects conflicts, and cancels future deliveries without deleting memories", async () => {
    const author = await registerUser(app, "owner.sync@example.test", "Owner");
    await verifyEmail(app, author.cookie, author.token);
    const other = await registerUser(app, "other.sync@example.test", "Other");
    const created = await app.inject({
      method: "POST",
      url: "/v1/contacts",
      headers: { cookie: author.cookie },
      payload: { displayName: "Amina", email: "amina@example.test", phone: "+1 555 010 0101", relationship: "sister", roles: ["recipient"] },
    });
    expect(created.statusCode).toBe(201);
    const id = created.json().contact.id as string;
    const duplicate = await app.inject({
      method: "POST",
      url: "/v1/contacts",
      headers: { cookie: author.cookie },
      payload: { displayName: "Amina again", email: "amina@example.test", phone: "+1 555 010 0102", roles: ["recipient"] },
    });
    expect(duplicate.statusCode).toBe(409);

    const invalid = await app.inject({
      method: "PATCH",
      url: `/v1/contacts/${id}`,
      headers: { cookie: author.cookie },
      payload: { email: "not-an-email" },
    });
    expect(invalid.statusCode).toBe(400);

    const edited = await app.inject({
      method: "PATCH",
      url: `/v1/contacts/${id}`,
      headers: { cookie: author.cookie },
      payload: { displayName: "Amina Khan", email: "amina.khan@example.test", phone: "+1 555 010 0199", relationship: "sister" },
    });
    expect(edited.statusCode).toBe(200);
    expect(edited.json().contact.emailVerified).toBe(false);
    const listed = await app.inject({ method: "GET", url: "/v1/contacts", headers: { cookie: author.cookie } });
    expect(listed.json().contacts).toEqual([
      expect.objectContaining({ id, displayName: "Amina Khan", email: "amina.khan@example.test", phone: "+1 555 010 0199" }),
    ]);
    const conflict = await app.inject({
      method: "POST",
      url: "/v1/contacts",
      headers: { cookie: author.cookie },
      payload: { displayName: "Second", email: "second@example.test", phone: "+1 555 010 0103", roles: ["recipient"] },
    });
    const clash = await app.inject({
      method: "PATCH",
      url: `/v1/contacts/${conflict.json().contact.id}`,
      headers: { cookie: author.cookie },
      payload: { email: "amina.khan@example.test" },
    });
    expect(clash.statusCode).toBe(409);

    const verification = await app.inject({
      method: "POST",
      url: `/v1/contacts/${id}/verification`,
      headers: { cookie: author.cookie },
    });
    const confirmed = await app.inject({
      method: "POST",
      url: `/v1/contacts/${id}/verify`,
      headers: { cookie: author.cookie },
      payload: { code: verification.json().devCode },
    });
    expect(confirmed.statusCode).toBe(200);
    const memory = await app.inject({
      method: "POST",
      url: "/v1/memories",
      headers: { cookie: author.cookie },
      payload: { title: "Keep this", body: "The letter stays" },
    });
    const memoryId = memory.json().memory.id as string;
    const saved = await schedule(author.cookie, memoryId, [id], "2026-12-01");
    expect(saved.statusCode).toBe(200);
    await app.prisma.releaseJob.create({
      data: {
        idempotencyKey: `pending-${memoryId}`,
        capsuleItemId: memoryId,
        personId: id,
        occurrenceAt: new Date("2026-12-01T09:00:00.000Z"),
        status: "pending",
      },
    });
    const removed = await app.inject({ method: "DELETE", url: `/v1/contacts/${id}`, headers: { cookie: author.cookie } });
    expect(removed.statusCode).toBe(204);
    const foreign = await app.inject({ method: "DELETE", url: `/v1/contacts/${id}`, headers: { cookie: other.cookie } });
    expect(foreign.statusCode).toBe(404);
    const still = await app.inject({ method: "GET", url: `/v1/memories/${memoryId}`, headers: { cookie: author.cookie } });
    expect(still.statusCode).toBe(200);
    expect(still.json().memory.title).toBe("Keep this");
    expect(still.json().memory.status).toBe("draft");
    const jobs = await app.prisma.releaseJob.findMany({ where: { capsuleItemId: memoryId, status: { in: ["pending", "sending", "failed"] } } });
    expect(jobs).toHaveLength(0);
    const anonymous = await app.inject({ method: "PATCH", url: `/v1/contacts/${id}`, payload: { displayName: "Nope" } });
    expect(anonymous.statusCode).toBe(401);
  });

  it("updates a shared memory for the recipient and withdraws access when the share or memory is removed", async () => {
    const author = await registerUser(app, "author.sync@example.test", "Author");
    const recipientUser = await registerUser(app, "recipient.sync@example.test", "Recipient");
    await verifyEmail(app, author.cookie, author.token);
    const recipient = await addVerifiedContact(app, author.cookie, {
      displayName: "Recipient",
      email: "recipient.sync@example.test",
    });
    const kept = await addVerifiedContact(app, author.cookie, {
      displayName: "Kept",
      email: "kept.sync@example.test",
    });
    const linked = await app.prisma.person.findUniqueOrThrow({ where: { id: recipient.id } });
    const recipientAccount = await app.prisma.user.findUniqueOrThrow({ where: { email: "recipient.sync@example.test" } });
    expect(linked.linkedUserId).toBe(recipientAccount.id);

    const created = await app.inject({
      method: "POST",
      url: "/v1/memories",
      headers: { cookie: author.cookie },
      payload: { title: "Original title", body: "Original letter" },
    });
    const id = created.json().memory.id as string;
    const firstSchedule = await schedule(author.cookie, id, [recipient.id, kept.id], "2026-12-01");
    expect(firstSchedule.statusCode).toBe(200);
    const edited = await app.inject({
      method: "PATCH",
      url: `/v1/memories/${id}`,
      headers: { cookie: author.cookie },
      payload: { title: "Updated title", body: "Updated letter" },
    });
    expect(edited.statusCode).toBe(200);
    expect(await app.prisma.capsuleItem.count({ where: { capsule: { ownerUserId: recipientAccount.id } } })).toBe(0);

    const beforeRelease = await app.inject({ method: "GET", url: `/v1/memories/${id}`, headers: { cookie: recipientUser.cookie } });
    expect(beforeRelease.statusCode).toBe(404);
    const moved = await schedule(author.cookie, id, [recipient.id, kept.id], "2026-12-02");
    expect(moved.statusCode).toBe(200);
    expect(moved.json().memory.schedule.localDate).toBe("2026-12-02");
    const active = await app.prisma.releaseRule.findMany({ where: { capsuleItemId: id, status: "active" } });
    expect(active).toHaveLength(1);
    expect(active[0]?.localDate).toBe("2026-12-02");

    await app.inject({
      method: "POST",
      url: "/v1/dev/clock",
      headers: { cookie: author.cookie },
      payload: { simulatedNow: "2026-12-02T09:00:00.000Z" },
    });
    const tick = await app.inject({ method: "POST", url: "/v1/dev/worker/tick", headers: { cookie: author.cookie } });
    expect(tick.json().calendarJobsSent).toBe(2);
    const seen = await app.inject({ method: "GET", url: "/v1/received", headers: { cookie: recipientUser.cookie } });
    expect(seen.statusCode).toBe(200);
    expect(seen.json().memories).toEqual([
      expect.objectContaining({ id, title: "Updated title", body: "Updated letter", access: "recipient" }),
    ]);
    const direct = await app.inject({ method: "GET", url: `/v1/memories/${id}`, headers: { cookie: recipientUser.cookie } });
    expect(direct.statusCode).toBe(200);
    expect(direct.json().memory.body).toBe("Updated letter");

    const stolenEdit = await app.inject({
      method: "PATCH",
      url: `/v1/memories/${id}`,
      headers: { cookie: recipientUser.cookie },
      payload: { title: "Stolen" },
    });
    const stolenDelete = await app.inject({ method: "DELETE", url: `/v1/memories/${id}`, headers: { cookie: recipientUser.cookie } });
    const stolenRecipients = await app.inject({
      method: "POST",
      url: `/v1/memories/${id}/schedule`,
      headers: { cookie: recipientUser.cookie },
      payload: { mode: "on_date", localDate: "2026-12-03", localTime: "09:00", timeZone: "UTC", recipientIds: [recipient.id] },
    });
    expect(stolenEdit.statusCode).toBe(404);
    expect(stolenDelete.statusCode).toBe(404);
    expect(stolenRecipients.statusCode).toBe(404);

    const second = await app.inject({
      method: "POST",
      url: "/v1/memories",
      headers: { cookie: author.cookie },
      payload: { title: "Second", body: "Only for a while" },
    });
    const secondId = second.json().memory.id as string;
    await app.inject({
      method: "POST",
      url: "/v1/dev/clock",
      headers: { cookie: author.cookie },
      payload: { simulatedNow: "2026-11-01T00:00:00.000Z" },
    });
    const shared = await schedule(author.cookie, secondId, [recipient.id], "2026-12-15");
    expect(shared.statusCode).toBe(200);
    await app.prisma.releaseJob.create({
      data: {
        idempotencyKey: `pending-${secondId}`,
        capsuleItemId: secondId,
        personId: recipient.id,
        occurrenceAt: new Date("2026-12-15T09:00:00.000Z"),
        status: "pending",
      },
    });
    const narrowed = await schedule(author.cookie, secondId, [kept.id], "2026-12-16");
    expect(narrowed.statusCode).toBe(200);
    expect(narrowed.json().memory.recipients.map((person: { id: string }) => person.id)).toEqual([kept.id]);
    const pending = await app.prisma.releaseJob.findMany({ where: { capsuleItemId: secondId, personId: recipient.id, status: "pending" } });
    expect(pending).toHaveLength(0);
    const hidden = await app.inject({ method: "GET", url: `/v1/memories/${secondId}`, headers: { cookie: recipientUser.cookie } });
    expect(hidden.statusCode).toBe(404);

    const deleted = await app.inject({ method: "DELETE", url: `/v1/memories/${secondId}`, headers: { cookie: author.cookie } });
    expect(deleted.statusCode).toBe(204);
    const ownerGone = await app.inject({ method: "GET", url: `/v1/memories/${secondId}`, headers: { cookie: author.cookie } });
    const receiverGone = await app.inject({ method: "GET", url: `/v1/memories/${secondId}`, headers: { cookie: recipientUser.cookie } });
    const ownerList = await app.inject({ method: "GET", url: "/v1/memories", headers: { cookie: author.cookie } });
    expect(ownerGone.statusCode).toBe(404);
    expect(receiverGone.statusCode).toBe(404);
    expect(ownerList.json().memories.map((memory: { id: string }) => memory.id)).not.toContain(secondId);
    const unauthenticated = await app.inject({ method: "GET", url: "/v1/received" });
    expect(unauthenticated.statusCode).toBe(401);
  });
});
