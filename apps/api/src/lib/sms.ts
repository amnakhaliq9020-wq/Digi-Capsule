import { env } from "../env";

const E164 = /^\+[1-9]\d{7,14}$/;

export function isE164(value: string | null | undefined): value is string {
  return Boolean(value && E164.test(value));
}

export function smsConfigured(): boolean {
  return Boolean(env.twilio.accountSid && env.twilio.authToken && env.twilio.from);
}

/** Automated tests never call Twilio. Live SMS requires credentials and opt-in. */
export function usesLiveSms(): boolean {
  return process.env.NODE_ENV !== "test" && smsConfigured();
}

export function maySendLiveSms(input: {
  phone: string | null | undefined;
  channelEnabled: boolean;
  consentActive: boolean;
}): boolean {
  return usesLiveSms() && input.channelEnabled && input.consentActive && isE164(input.phone);
}

export async function submitSms(input: { to: string; body: string }): Promise<{ messageId: string }> {
  if (!isE164(input.to)) {
    const error = new Error("The phone number is not in international format.");
    Object.assign(error, { code: "SMS_INVALID_NUMBER" });
    throw error;
  }
  if (!smsConfigured()) {
    const error = new Error("SMS delivery is not configured on this server.");
    Object.assign(error, { code: "SMS_NOT_CONFIGURED" });
    throw error;
  }
  const body = new URLSearchParams({ To: input.to, From: env.twilio.from, Body: input.body });
  const auth = Buffer.from(`${env.twilio.accountSid}:${env.twilio.authToken}`).toString("base64");
  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${env.twilio.accountSid}/Messages.json`, {
    method: "POST",
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
    body,
    signal: AbortSignal.timeout(15_000),
  });
  const payload = await response.json().catch(() => ({})) as { sid?: string; message?: string };
  if (!response.ok || !payload.sid) {
    const error = new Error("The SMS provider did not accept the message.");
    Object.assign(error, { code: response.status === 401 ? "SMS_AUTH_FAILED" : "SMS_FAILED" });
    throw error;
  }
  return { messageId: payload.sid };
}

export function smsFailure(error: unknown): { code: string; message: string } {
  const raw = error && typeof error === "object" && "code" in error ? String((error as { code: unknown }).code) : "";
  if (raw === "SMS_NOT_CONFIGURED") return { code: raw, message: "SMS delivery is not configured on this server." };
  if (raw === "SMS_INVALID_NUMBER") return { code: raw, message: "Enter a phone number in international format, starting with +." };
  if (raw === "SMS_AUTH_FAILED") return { code: raw, message: "The SMS provider rejected the sign-in." };
  if (error instanceof Error && error.name === "TimeoutError") return { code: "SMS_TIMEOUT", message: "The SMS provider did not respond in time." };
  return { code: "SMS_FAILED", message: "The SMS provider did not accept the message." };
}
