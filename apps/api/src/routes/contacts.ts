import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireUser } from "../auth";
import { isTestMode } from "../env";
import { AppError, fromZod } from "../errors";
import { audit } from "../lib/audit";
import { randomToken, sha256 } from "../lib/crypto";
import { deliverEmail } from "../lib/notify";

const roleSchema = z.enum(["recipient", "trusted_contact", "verifier"]);

const phoneSchema = z
  .string("Enter a phone number.")
  .trim()
  .min(1, "Enter a phone number.")
  .max(30, "That phone number is too long.")
  .refine((value) => /^[0-9+().\-\s]+$/.test(value), "Use digits, spaces, and + ( ) - .")
  .refine((value) => (value.match(/\d/g) ?? []).length >= 7, "Enter a phone number with at least 7 digits.");

function present(person: {
  id: string;
  displayName: string;
  email: string | null;
  phone: string | null;
  relationship: string | null;
  roles: { role: "recipient" | "trusted_contact" | "verifier"; channelVerifiedAt: Date | null; revokedAt: Date | null }[];
}) {
  const roles = person.roles.filter((role) => !role.revokedAt);
  return {
    id: person.id,
    displayName: person.displayName,
    email: person.email,
    phone: person.phone,
    relationship: person.relationship,
    roles: roles.map((role) => role.role),
    emailVerified: roles.some((role) => role.channelVerifiedAt),
  };
}

export async function contactRoutes(app: FastifyInstance) {
  app.get("/contacts", async (request) => {
    const user = await requireUser(request);
    const people = await app.prisma.person.findMany({
      where: { ownerUserId: user.id },
      include: { roles: true },
      orderBy: { displayName: "asc" },
    });
    return { contacts: people.map(present) };
  });

  app.post("/contacts", async (request, reply) => {
    const user = await requireUser(request);
    const parsed = z
      .object({
        displayName: z.string().trim().min(1, "Enter a name.").max(80),
        email: z.string().trim().email("Enter a valid email address.").max(254),
        phone: phoneSchema,
        relationship: z.string().trim().max(80).optional(),
        roles: z.array(roleSchema).min(1, "Choose at least one role.").default(["recipient"]),
      })
      .safeParse(request.body);
    if (!parsed.success) throw fromZod(parsed.error);
    const email = parsed.data.email.toLowerCase();
    const duplicate = await app.prisma.person.findFirst({ where: { ownerUserId: user.id, email } });
    if (duplicate) throw new AppError(409, "CONTACT_EXISTS", "You already have a contact with this email.");
    const person = await app.prisma.person.create({
      data: {
        ownerUserId: user.id,
        displayName: parsed.data.displayName,
        email,
        phone: parsed.data.phone,
        relationship: parsed.data.relationship,
        roles: { create: parsed.data.roles.map((role) => ({ role })) },
      },
      include: { roles: true },
    });
    await audit(app.prisma, { actorUserId: user.id, action: "contact.created", entityType: "person", entityId: person.id });
    return reply.code(201).send({ contact: present(person) });
  });

  app.patch("/contacts/:id", async (request) => {
    const user = await requireUser(request);
    const { id } = request.params as { id: string };
    const existing = await app.prisma.person.findFirst({ where: { id, ownerUserId: user.id }, include: { roles: true } });
    if (!existing) throw new AppError(404, "NOT_FOUND", "Contact not found.");
    const parsed = z
      .object({
        displayName: z.string().trim().min(1, "Enter a name.").max(80).optional(),
        email: z.string().trim().email("Enter a valid email address.").optional(),
        phone: phoneSchema.optional(),
        relationship: z.string().trim().max(80).nullable().optional(),
        roles: z.array(roleSchema).min(1).optional(),
      })
      .safeParse(request.body);
    if (!parsed.success) throw fromZod(parsed.error);
    const email = parsed.data.email?.toLowerCase();
    if (email && email !== existing.email) {
      const duplicate = await app.prisma.person.findFirst({ where: { ownerUserId: user.id, email, NOT: { id } } });
      if (duplicate) throw new AppError(409, "CONTACT_EXISTS", "You already have a contact with this email.");
    }
    const person = await app.prisma.$transaction(async (tx) => {
      if (parsed.data.roles) {
        await tx.contactRole.updateMany({ where: { personId: id, revokedAt: null }, data: { revokedAt: new Date() } });
        for (const role of parsed.data.roles) {
          const verified = email && email !== existing.email ? null : existing.roles.find((entry) => entry.role === role && !entry.revokedAt)?.channelVerifiedAt ?? null;
          await tx.contactRole.create({ data: { personId: id, role, channelVerifiedAt: verified } });
        }
      } else if (email && email !== existing.email) {
        await tx.contactRole.updateMany({ where: { personId: id, revokedAt: null }, data: { channelVerifiedAt: null } });
      }
      return tx.person.update({
        where: { id },
        data: {
          displayName: parsed.data.displayName,
          email,
          phone: parsed.data.phone,
          relationship: parsed.data.relationship,
        },
        include: { roles: true },
      });
    });
    return { contact: present(person) };
  });

  app.delete("/contacts/:id", async (request, reply) => {
    const user = await requireUser(request);
    const { id } = request.params as { id: string };
    const existing = await app.prisma.person.findFirst({ where: { id, ownerUserId: user.id } });
    if (!existing) throw new AppError(404, "NOT_FOUND", "Contact not found.");
    const sent = await app.prisma.releaseJob.count({ where: { personId: id, status: "sent" } });
    if (sent > 0) throw new AppError(409, "CONTACT_HAS_DELIVERIES", "This contact already received a memory and cannot be removed.");
    await app.prisma.person.delete({ where: { id } });
    return reply.code(204).send();
  });

  app.post("/contacts/:id/verification", async (request) => {
    const user = await requireUser(request);
    const { id } = request.params as { id: string };
    const person = await app.prisma.person.findFirst({ where: { id, ownerUserId: user.id } });
    if (!person?.email) throw new AppError(404, "NOT_FOUND", "Contact not found.");
    const code = randomToken(9);
    await app.prisma.contactVerificationToken.create({
      data: { personId: person.id, tokenHash: sha256(code), expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000) },
    });
    await deliverEmail(app.prisma, {
      to: person.email,
      templateId: "contact_verification",
      variables: { code },
      idempotencyKey: `contact-verify:${person.id}:${code.slice(0, 8)}`,
      relatedType: "person",
      relatedId: person.id,
    });
    return { sent: true, devCode: isTestMode() ? code : undefined };
  });

  app.post("/contacts/:id/verify", async (request) => {
    const user = await requireUser(request);
    const { id } = request.params as { id: string };
    const person = await app.prisma.person.findFirst({ where: { id, ownerUserId: user.id }, include: { roles: true } });
    if (!person) throw new AppError(404, "NOT_FOUND", "Contact not found.");
    const parsed = z.object({ code: z.string().min(8, "Enter the verification code.") }).safeParse(request.body);
    if (!parsed.success) throw fromZod(parsed.error);
    const token = await app.prisma.contactVerificationToken.findUnique({ where: { tokenHash: sha256(parsed.data.code) } });
    if (!token || token.personId !== person.id || token.usedAt || token.expiresAt.getTime() < Date.now()) {
      throw new AppError(400, "INVALID_TOKEN", "That verification code is invalid or expired.");
    }
    const now = new Date();
    await app.prisma.$transaction([
      app.prisma.contactVerificationToken.update({ where: { id: token.id }, data: { usedAt: now } }),
      app.prisma.contactRole.updateMany({ where: { personId: person.id, revokedAt: null }, data: { channelVerifiedAt: now } }),
    ]);
    await audit(app.prisma, { actorUserId: user.id, action: "contact.email_verified", entityType: "person", entityId: person.id });
    const fresh = await app.prisma.person.findUniqueOrThrow({ where: { id: person.id }, include: { roles: true } });
    return { contact: present(fresh) };
  });
}
