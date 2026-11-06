import type { FastifyInstance, LightMyRequestResponse } from "fastify";
import { buildApp } from "../app";

export const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

export async function createApp() {
  const app = await buildApp();
  return app;
}

export async function resetDatabase(app: FastifyInstance) {
  await app.prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      attestations,
      release_jobs,
      release_rules,
      item_grants,
      item_media,
      media_assets,
      contact_verification_tokens,
      contact_roles,
      persons,
      check_in_events,
      check_in_cycles,
      check_in_policies,
      notification_deliveries,
      verification_cases,
      capsule_items,
      capsules,
      consent_records,
      audit_events,
      email_verification_tokens,
      sessions,
      login_attempts,
      dev_messages,
      dev_clock,
      profiles,
      users
    RESTART IDENTITY CASCADE
  `);
}

export function sessionCookie(response: LightMyRequestResponse) {
  const raw = response.headers["set-cookie"];
  const lines = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const line = lines.find((value) => value.startsWith("digi_session="));
  if (!line) throw new Error("Session cookie was not set.");
  return line.split(";")[0];
}

export async function registerUser(app: FastifyInstance, email: string, name = "Test Author") {
  const response = await app.inject({
    method: "POST",
    url: "/v1/auth/register",
    payload: { displayName: name, email, password: "Correct-Horse-1", timeZone: "UTC" },
  });
  const body = response.json();
  return { response, body, cookie: sessionCookie(response), token: body.devVerificationToken as string };
}

export async function verifyEmail(app: FastifyInstance, cookie: string, token: string) {
  const response = await app.inject({
    method: "POST",
    url: "/v1/auth/verify-email",
    headers: { cookie },
    payload: { token },
  });
  if (response.statusCode !== 200) throw new Error(response.body);
  return response;
}

export async function addVerifiedContact(
  app: FastifyInstance,
  cookie: string,
  input: { displayName: string; email: string; roles?: string[] },
) {
  const created = await app.inject({
    method: "POST",
    url: "/v1/contacts",
    headers: { cookie },
    payload: input,
  });
  const contact = created.json().contact;
  const verification = await app.inject({
    method: "POST",
    url: `/v1/contacts/${contact.id}/verification`,
    headers: { cookie },
  });
  const verified = await app.inject({
    method: "POST",
    url: `/v1/contacts/${contact.id}/verify`,
    headers: { cookie },
    payload: { code: verification.json().devCode },
  });
  if (verified.statusCode !== 200) throw new Error(verified.body);
  return verified.json().contact as { id: string; email: string; displayName: string };
}

export function multipart(file: Buffer, filename: string, mime: string) {
  const boundary = "----digiboundary";
  const body = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${mime}\r\n\r\n`,
    ),
    file,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  return { body, headers: { "content-type": `multipart/form-data; boundary=${boundary}` } };
}
