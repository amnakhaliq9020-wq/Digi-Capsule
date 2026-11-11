import { existsSync } from "node:fs";
import path from "node:path";
import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";
import { env } from "../env";

export const OFFICIAL_SENDER_ADDRESS = "hello@izzyai.com";
export const OFFICIAL_SENDER_NAME = "Digi Capsule";
export const OFFICIAL_FROM = `${OFFICIAL_SENDER_NAME} <${OFFICIAL_SENDER_ADDRESS}>`;

function configuredFromMatches(): boolean {
  const configured = env.smtp.from.trim().toLowerCase();
  return configured === OFFICIAL_SENDER_ADDRESS || configured === OFFICIAL_FROM.toLowerCase();
}

export function smtpConfigured(): boolean {
  const smtp = activeSmtp();
  return Boolean(smtp.host && smtp.user && smtp.password && configuredFromMatches());
}

/** Automated tests keep the local console inbox. A configured server sends through SMTP. */
export function usesLiveSmtp(): boolean {
  return process.env.NODE_ENV !== "test" && smtpConfigured();
}

let cached: Transporter | null = null;
let runtime: { host: string; port: number; user: string; password: string; secure: boolean } | null = null;

export function setMailRuntime(value: { host: string; port: number; user: string; password: string; encryption: "starttls" | "ssl" } | null) {
  runtime = value
    ? { host: value.host, port: value.port, user: value.user, password: value.password, secure: value.encryption === "ssl" }
    : null;
  cached = null;
}

function activeSmtp() {
  if (runtime) return runtime;
  const secure = env.smtp.port === 465;
  return { host: env.smtp.host, port: env.smtp.port, user: env.smtp.user, password: env.smtp.password, secure };
}

function transport(): Transporter {
  if (!cached) {
    const smtp = activeSmtp();
    cached = nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.secure,
      requireTLS: !smtp.secure,
      auth: { user: smtp.user, pass: smtp.password },
      connectionTimeout: 15_000,
      greetingTimeout: 15_000,
      socketTimeout: 20_000,
    });
  }
  return cached;
}

export async function verifySmtpLogin(): Promise<{ ok: true } | { ok: false; code: string }> {
  if (process.env.NODE_ENV === "test") return { ok: false, code: "UNVERIFIED" };
  try {
    await transport().verify();
    return { ok: true };
  } catch (error) {
    return { ok: false, code: mailFailure(error).code };
  }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function logoPath(): string | null {
  const candidates = [
    path.resolve(process.cwd(), "apps/web/public/logo.png"),
    path.resolve(process.cwd(), "../web/public/logo.png"),
    path.resolve(process.cwd(), "../../apps/web/public/logo.png"),
  ];
  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

function brandedHtml(text: string, logo: string | null): string {
  const paragraphs = escapeHtml(text)
    .split(/\n{2,}/)
    .map((paragraph) => `<p style="margin:0 0 16px;">${paragraph.replaceAll("\n", "<br>")}</p>`)
    .join("");
  const mark = logo
    ? `<img src="cid:logo@izzyai.com" alt="Digi Capsule" width="40" height="40" style="vertical-align:middle;border:0;border-radius:8px;">`
    : "";
  return `<!DOCTYPE html><html><body style="margin:0;background:#f4fff9;color:#042117;font-family:Segoe UI,Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0b6b4a;"><tr><td style="padding:20px 24px;">${mark}<span style="color:#f4fff9;font-size:20px;font-weight:700;margin-left:12px;vertical-align:middle;">Digi Capsule</span></td></tr></table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding:24px;font-size:16px;line-height:1.5;">${paragraphs}</td></tr></table>
<p style="margin:0;padding:0 24px 24px;color:#0b6b4a;font-size:13px;">Digi Capsule · ${OFFICIAL_SENDER_ADDRESS}</p>
</body></html>`;
}

export const capturedMail: { from: string; replyTo: string; to: string; subject: string }[] = [];

export async function submitEmail(input: { to: string; subject: string; text: string }): Promise<{ messageId: string; envelopeFrom: string }> {
  const to = input.to.trim();
  if (!to) {
    const rejected = new Error("A recipient address is required.");
    Object.assign(rejected, { code: "ERECIPIENT" });
    throw rejected;
  }
  if (!configuredFromMatches()) {
    const rejected = new Error("SMTP_FROM must be hello@izzyai.com.");
    Object.assign(rejected, { code: "ESENDER" });
    throw rejected;
  }
  if (process.env.NODE_ENV === "test") {
    capturedMail.push({ from: OFFICIAL_FROM, replyTo: OFFICIAL_SENDER_ADDRESS, to, subject: input.subject });
    return { messageId: "test-message", envelopeFrom: OFFICIAL_SENDER_ADDRESS };
  }
  const logo = logoPath();
  const info = await transport().sendMail({
    from: OFFICIAL_FROM,
    replyTo: OFFICIAL_SENDER_ADDRESS,
    to,
    envelope: { from: OFFICIAL_SENDER_ADDRESS, to },
    subject: input.subject,
    text: input.text,
    html: brandedHtml(input.text, logo),
    attachments: logo ? [{ filename: "logo.png", path: logo, cid: "logo@izzyai.com" }] : [],
  });
  const accepted = Array.isArray(info.accepted) && info.accepted.length > 0;
  const envelopeFrom = typeof info.envelope?.from === "string" ? info.envelope.from.toLowerCase() : "";
  if (!accepted || envelopeFrom !== OFFICIAL_SENDER_ADDRESS) {
    const rejected = new Error(accepted ? "The mail server did not use hello@izzyai.com as the sender." : "The mail server rejected the recipient.");
    Object.assign(rejected, { code: accepted ? "ESENDER" : "EENVELOPE" });
    throw rejected;
  }
  return { messageId: typeof info.messageId === "string" ? info.messageId : "", envelopeFrom };
}

export function mailFailure(error: unknown): { code: string; message: string } {
  const raw = error && typeof error === "object" && "code" in error ? String((error as { code: unknown }).code) : "";
  if (raw === "EAUTH") return { code: "SMTP_AUTH_FAILED", message: "The mail server rejected the sign-in." };
  if (raw === "ETIMEDOUT" || raw === "ESOCKET" || raw === "ECONNECTION") {
    return { code: "SMTP_TIMEOUT", message: "The mail server did not respond in time." };
  }
  if (raw === "ERECIPIENT") return { code: "RECIPIENT_REQUIRED", message: "Enter the email address that should receive this message." };
  if (raw === "ESENDER") return { code: "SMTP_SENDER_REJECTED", message: "The mail server did not accept hello@izzyai.com as the sender." };
  if (raw === "EENVELOPE") return { code: "SMTP_REJECTED", message: "The mail server rejected the recipient." };
  return { code: "SMTP_FAILED", message: "The mail server did not accept the message." };
}

export function subjectFor(templateId: string): string {
  switch (templateId) {
    case "email_verification":
      return "Confirm your Digi Capsule email";
    case "password_reset":
      return "Reset your Digi Capsule password";
    case "password_changed":
      return "Your Digi Capsule password changed";
    case "contact_verification":
      return "Confirm a Digi Capsule contact";
    case "check_in_due":
      return "Digi Capsule check-in";
    case "check_in_reminder":
      return "Digi Capsule check-in reminder";
    case "check_in_window_final":
      return "Digi Capsule final check-in warning";
    case "check_in_escalation":
      return "Digi Capsule check-in review";
    case "trusted_contact_unreachable":
      return "Digi Capsule trusted contact notice";
    case "memory_ready":
      return "A Digi Capsule memory is ready";
    case "review_recovered":
      return "Digi Capsule review stopped";
    case "test_email":
      return "Digi Capsule test";
    default:
      return "Digi Capsule";
  }
}
