"use client";

import { useEffect, useState } from "react";
import { Shell } from "@/components/Shell";
import { ApiError, api } from "@/lib/api";
import { formatWhen, zonesWith } from "@/lib/time";

type Account = { displayName: string; email: string; emailVerified: boolean; timeZone: string };

export default function AccountPage() {
  const [account, setAccount] = useState<Account | null>(null);
  const [timeZone, setTimeZone] = useState("UTC");
  const [serverTime, setServerTime] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    api<{ user: Account }>("/v1/auth/me").then((data) => {
      setAccount(data.user);
      setTimeZone(data.user.timeZone);
    }).catch((err) => setError(err instanceof ApiError ? err.message : "Could not load your time zone."));
    api<{ serverTime: string }>("/v1/health").then((data) => setServerTime(data.serverTime)).catch(() => undefined);
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
        {error ? <p className="error" role="alert">{error}</p> : null}
        {message ? <p className="banner">{message}</p> : null}
        <p><button type="submit">Save time zone</button></p>
      </form>
      </div>
    </Shell>
  );
}
