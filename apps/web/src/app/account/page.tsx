"use client";

import { useEffect, useState } from "react";
import { useA11y, visionModes, type VisionMode } from "@/components/Accessibility";
import { Shell } from "@/components/Shell";
import { Status, statusKindFor } from "@/components/Status";
import { ApiError, api } from "@/lib/api";
import { formatWhen, zonesWith } from "@/lib/time";

type Account = { displayName: string; email: string; emailVerified: boolean; timeZone: string };
type Notice = { id: string; channel: string; templateId: string; status: string; errorCode: string | null; sentAt: string | null; cancelledAt: string | null; attemptCount: number };
type SmtpView = {
  sender: { name: string; email: string; replyTo: string; from: string };
  server: { host: string; port: number; username: string; encryption: "starttls" | "ssl"; passwordSet: boolean };
  status: { configured: boolean; connection: string; lastSuccessAt: string | null; lastFailureAt: string | null; lastFailureCode: string | null; senderVerifiedAt: string | null };
};

const visionLabels: Record<VisionMode, string> = {
  default: "Default theme",
  protanopia: "Protanopia — red color vision deficiency",
  deuteranopia: "Deuteranopia — green color vision deficiency",
  tritanopia: "Tritanopia — blue-yellow color vision deficiency",
  achromatopsia: "Achromatopsia — monochromatic vision",
};

export default function AccountPage() {
  const { prefs, update } = useA11y();
  const [account, setAccount] = useState<Account | null>(null);
  const [timeZone, setTimeZone] = useState("UTC");
  const [serverTime, setServerTime] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [passwordMessage, setPasswordMessage] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [smtp, setSmtp] = useState<SmtpView | null>(null);
  const [smtpHost, setSmtpHost] = useState("");
  const [smtpPort, setSmtpPort] = useState("587");
  const [smtpUser, setSmtpUser] = useState("");
  const [smtpPassword, setSmtpPassword] = useState("");
  const [smtpEncryption, setSmtpEncryption] = useState<"starttls" | "ssl">("starttls");
  const [smtpError, setSmtpError] = useState("");
  const [smtpPending, setSmtpPending] = useState(false);
  const [testRecipient, setTestRecipient] = useState("");
  const [sentRecipient, setSentRecipient] = useState("");
  const [testMessage, setTestMessage] = useState("");
  const [testError, setTestError] = useState("");
  const [testPending, setTestPending] = useState(false);
  const [emailConfirmed, setEmailConfirmed] = useState(false);
  const [smsTo, setSmsTo] = useState("");
  const [smsConfirmed, setSmsConfirmed] = useState(false);
  const [smsMessage, setSmsMessage] = useState("");
  const [smsError, setSmsError] = useState("");
  const [smsPending, setSmsPending] = useState(false);
  const [notices, setNotices] = useState<Notice[]>([]);

  useEffect(() => {
    api<{ user: Account }>("/v1/auth/me").then((data) => {
      setAccount(data.user);
      setTimeZone(data.user.timeZone);
    }).catch((err) => setError(err instanceof ApiError ? err.message : "Could not load your time zone."));
    api<{ serverTime: string }>("/v1/health").then((data) => setServerTime(data.serverTime)).catch(() => undefined);
    api<{ notifications: Notice[] }>("/v1/settings/notifications").then((data) => setNotices(data.notifications)).catch(() => undefined);
    api<SmtpView>("/v1/settings/smtp").then((data) => {
      setSmtp(data);
      setSmtpHost(data.server.host);
      setSmtpPort(String(data.server.port || 587));
      setSmtpUser(data.server.username);
      setSmtpEncryption(data.server.encryption);
    }).catch(() => undefined);
  }, []);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setMessage("");
    try {
      const saved = await api<{ user: { timeZone: string } }>("/v1/auth/me", { method: "PATCH", body: JSON.stringify({ timeZone }) });
      setTimeZone(saved.user.timeZone);
      setMessage("Time zone saved. Dates on this account now use this zone.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save the time zone.");
    }
  }

  async function changePassword(event: React.FormEvent) {
    event.preventDefault();
    setPasswordError("");
    setPasswordMessage("");
    try {
      await api("/v1/auth/password", { method: "POST", body: JSON.stringify({ currentPassword, newPassword }) });
      setCurrentPassword("");
      setNewPassword("");
      setPasswordMessage("Password changed. Other sessions on this account were signed out.");
    } catch (err) {
      setPasswordError(err instanceof ApiError ? err.message : "Could not change the password.");
    }
  }

  async function sendTestSms(event: React.FormEvent) {
    event.preventDefault();
    if (smsPending) return;
    if (!smsConfirmed) {
      setSmsError("Confirm that this sends one real SMS.");
      return;
    }
    setSmsError("");
    setSmsMessage("");
    setSmsPending(true);
    try {
      const result = await api<{ message: string }>("/v1/settings/test-sms", {
        method: "POST",
        body: JSON.stringify({ to: smsTo, confirm: true }),
      });
      setSmsMessage(result.message);
    } catch (err) {
      setSmsError(err instanceof ApiError ? err.message : "The test SMS could not be sent.");
    } finally {
      setSmsPending(false);
    }
  }

  async function saveSmtp(event: React.FormEvent) {
    event.preventDefault();
    if (smtpPending) return;
    setSmtpError("");
    setSmtpPending(true);
    try {
      const saved = await api<SmtpView>("/v1/settings/smtp", {
        method: "PUT",
        body: JSON.stringify({
          host: smtpHost,
          port: Number(smtpPort),
          username: smtpUser,
          encryption: smtpEncryption,
          ...(smtpPassword ? { password: smtpPassword } : {}),
        }),
      });
      setSmtp(saved);
      setSmtpPassword("");
    } catch (err) {
      setSmtpError(err instanceof ApiError ? err.message : "Could not save the SMTP configuration.");
    } finally {
      setSmtpPending(false);
    }
  }

  async function sendTestEmail(event: React.FormEvent) {
    event.preventDefault();
    if (testPending) return;
    if (!emailConfirmed) {
      setTestError("Confirm that this sends one real email.");
      return;
    }
    setTestError("");
    setTestMessage("");
    setTestPending(true);
    try {
      const result = await api<{ message: string; recipient: string }>("/v1/settings/test-email", {
        method: "POST",
        body: JSON.stringify({ to: testRecipient, confirm: true }),
      });
      setSentRecipient(result.recipient);
      setTestMessage(result.message);
      const latest = await api<SmtpView>("/v1/settings/smtp");
      setSmtp(latest);
      const list = await api<{ notifications: Notice[] }>("/v1/settings/notifications");
      setNotices(list.notifications);
    } catch (err) {
      setTestError(err instanceof ApiError ? err.message : "The test email could not be sent.");
    } finally {
      setTestPending(false);
    }
  }

  return (
    <Shell>
      <h1>Settings</h1>
      <p className="muted">Scheduling uses the server clock. Dates and times are shown in the zone you choose here.</p>
      <div className="stack">
      <article className="card stack">
        <h2>This account</h2>
        <p><strong>{account?.displayName || "Loading…"}</strong></p>
        <p className="muted">{account?.email || "Loading your email…"}</p>
        <p className="muted">{account ? (account.emailVerified ? "Email confirmed." : "Email is not confirmed yet.") : ""}</p>
      </article>
      <form className="card stack" onSubmit={(event) => void save(event)}>
        <p>Server time: {serverTime ? formatWhen(serverTime, timeZone) : "Loading…"} ({timeZone})</p>
        <label htmlFor="zone">Your time zone</label>
        <select id="zone" value={timeZone} onChange={(event) => setTimeZone(event.target.value)}>
          {zonesWith(timeZone).map((zone) => <option key={zone}>{zone}</option>)}
        </select>
        {error ? <Status kind="error">{error}</Status> : null}
        {message ? <Status kind="success">{message}</Status> : null}
        <p><button type="submit">Save time zone</button></p>
      </form>
      <form className="card stack" onSubmit={(event) => void changePassword(event)}>
        <h2>Password</h2>
        <label htmlFor="current-password">Current password</label>
        <input id="current-password" type="password" autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} required />
        <label htmlFor="new-password">New password</label>
        <input id="new-password" type="password" autoComplete="new-password" aria-describedby="password-help" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} required />
        <p id="password-help" className="muted">At least 10 characters, with a letter and a number. Other signed-in sessions are signed out.</p>
        {passwordError ? <p className="error" role="alert">{passwordError}</p> : null}
        {passwordMessage ? <p className="banner">{passwordMessage}</p> : null}
        <p><button type="submit">Change password</button></p>
      </form>
      <form className="card stack" onSubmit={(event) => event.preventDefault()}>
        <h2><span className="row">Color Vision Accessibility</span></h2>
        <p className="muted">These modes change the palette for the whole application. They are design aids, not a substitute for testing with people who have a color-vision deficiency.</p>
        <fieldset>
          <legend>Color vision mode</legend>
          {visionModes.map((mode) => (
            <label key={mode} className="check">
              <input type="radio" name="color-vision" checked={prefs.colorVision === mode} onChange={() => update({ ...prefs, colorVision: mode })} /> {visionLabels[mode]}
            </label>
          ))}
        </fieldset>
        <label className="check"><input type="checkbox" checked={prefs.highContrast} onChange={(event) => update({ ...prefs, highContrast: event.target.checked })} /> High contrast</label>
        <label className="check"><input type="checkbox" checked={prefs.largeText} onChange={(event) => update({ ...prefs, largeText: event.target.checked })} /> Increased text size</label>
        <label className="check"><input type="checkbox" checked={prefs.reducedMotion} onChange={(event) => update({ ...prefs, reducedMotion: event.target.checked })} /> Reduced motion</label>
      </form>
      {smtp ? (
        <>
          <article className="card stack">
            <h2>Sender identity</h2>
            <p>Sender name: {smtp.sender.name}</p>
            <p>Sender email: {smtp.sender.email}</p>
            <p>Reply-to email: {smtp.sender.replyTo}</p>
            <p className="muted">This address sends mail. It is not the recipient.</p>
          </article>
          <form className="card stack" onSubmit={(event) => void saveSmtp(event)}>
            <h2>SMTP server</h2>
            <label htmlFor="smtp-host">SMTP host</label>
            <input id="smtp-host" value={smtpHost} onChange={(event) => setSmtpHost(event.target.value)} required />
            <label htmlFor="smtp-port">Port</label>
            <input id="smtp-port" inputMode="numeric" value={smtpPort} onChange={(event) => setSmtpPort(event.target.value)} required />
            <label htmlFor="smtp-user">Username</label>
            <input id="smtp-user" value={smtpUser} onChange={(event) => setSmtpUser(event.target.value)} autoComplete="off" required />
            <label htmlFor="smtp-password">Password</label>
            <input id="smtp-password" type="password" value={smtpPassword} onChange={(event) => setSmtpPassword(event.target.value)} autoComplete="new-password" placeholder={smtp.server.passwordSet ? "Saved on the server" : "Enter the SMTP password"} />
            <label htmlFor="smtp-encryption">TLS/SSL</label>
            <select id="smtp-encryption" value={smtpEncryption} onChange={(event) => setSmtpEncryption(event.target.value === "ssl" ? "ssl" : "starttls")}>
              <option value="starttls">TLS (STARTTLS)</option>
              <option value="ssl">SSL</option>
            </select>
            {smtpError ? <p className="error" role="alert">{smtpError}</p> : null}
            <p><button type="submit" disabled={smtpPending}>{smtpPending ? "Saving…" : "Save Configuration"}</button></p>
          </form>
          <form className="card stack" onSubmit={(event) => void sendTestEmail(event)}>
            <h2>Send test email</h2>
            <label htmlFor="test-recipient">Test Recipient Email</label>
            <input id="test-recipient" type="email" autoComplete="off" placeholder="Enter the email address that should receive the test email." value={testRecipient} onChange={(event) => setTestRecipient(event.target.value)} required />
            <p className="muted">The address you type is the recipient. The sender stays {smtp.sender.from}.</p>
            <label><input type="checkbox" checked={emailConfirmed} onChange={(event) => setEmailConfirmed(event.target.checked)} /> I confirm this sends one real email to the address above.</label>
            {testError ? <p className="error" role="alert">{testError}</p> : null}
            {testMessage ? <p className="banner" role="status">{testMessage}{sentRecipient ? ` Recipient: ${sentRecipient}.` : ""}</p> : null}
            <p><button type="submit" disabled={testPending}>{testPending ? "Sending…" : "Send Test Email"}</button></p>
          </form>
          <article className="card stack">
            <h2>SMTP connection status</h2>
            <p>Configuration: {smtp.status.configured ? "Credentials are present" : "Incomplete"}</p>
            <p>Connection: {smtp.status.connection === "connected" ? "Connected" : smtp.status.connection === "failed" ? "Failed" : "Not verified"}</p>
            <p>Last successful send: {smtp.status.lastSuccessAt ? formatWhen(smtp.status.lastSuccessAt, timeZone) : "None"}</p>
            <p>Last failed send: {smtp.status.lastFailureAt ? `${formatWhen(smtp.status.lastFailureAt, timeZone)}${smtp.status.lastFailureCode ? ` (${smtp.status.lastFailureCode})` : ""}` : "None"}</p>
            <p>Sender verification: {smtp.status.senderVerifiedAt ? `Verified ${formatWhen(smtp.status.senderVerifiedAt, timeZone)}` : "Not verified by a successful sign-in or send"}</p>
          </article>
        </>
      ) : null}
      <form className="card stack" onSubmit={(event) => void sendTestSms(event)}>
        <h2>SMS</h2>
        <label htmlFor="test-sms">Opted-in test phone</label>
        <input id="test-sms" type="tel" placeholder="+15551234567" value={smsTo} onChange={(event) => setSmsTo(event.target.value)} required />
        <p className="muted">Sends one warning only to the phone number configured on the server. A missing SMS provider returns an error and does not invent a message.</p>
        <label><input type="checkbox" checked={smsConfirmed} onChange={(event) => setSmsConfirmed(event.target.checked)} /> I confirm this sends one real SMS.</label>
        {smsError ? <p className="error" role="alert">{smsError}</p> : null}
        {smsMessage ? <p className="banner">{smsMessage}</p> : null}
        <p><button type="submit" disabled={smsPending}>{smsPending ? "Sending…" : "Send Test SMS"}</button></p>
      </form>
      <article className="card stack">
        <h2>Notification status</h2>
        {notices.length === 0 ? <p className="muted">No messages recorded for this account yet.</p> : null}
        {notices.map((notice) => (
          <p key={notice.id}><Status kind={statusKindFor(notice.status)}>{notice.channel} · {notice.templateId.replaceAll("_", " ")}{notice.errorCode ? ` · ${notice.errorCode}` : ""}</Status></p>
        ))}
      </article>
      </div>
    </Shell>
  );
}
