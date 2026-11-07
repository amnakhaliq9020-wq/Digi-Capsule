"use client";

import { useEffect, useState } from "react";
import { Shell } from "@/components/Shell";
import { ApiError, api } from "@/lib/api";
import { formatWhen, zonesWith } from "@/lib/time";

export default function AccountPage() {
  const [timeZone, setTimeZone] = useState("UTC");
  const [serverTime, setServerTime] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    api<{ user: { timeZone: string } }>("/v1/auth/me").then((data) => setTimeZone(data.user.timeZone)).catch((err) => setError(err instanceof ApiError ? err.message : "Could not load your time zone."));
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
      <h1>Time zone</h1>
      <p className="muted">Scheduling uses the server clock. Dates and times are shown in the zone you choose here.</p>
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
    </Shell>
  );
}
