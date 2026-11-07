"use client";

import { useEffect, useState } from "react";
import { Shell } from "@/components/Shell";
import { ApiError, api } from "@/lib/api";
import { formatWhen } from "@/lib/time";

type Inbox = { id: string; templateId: string; destination: string; variables: { text?: string }; createdAt: string };
type Contact = { id: string; displayName: string; roles: string[] };

export default function DevConsolePage() {
  const [now, setNow] = useState("");
  const [flag, setFlag] = useState(false);
  const [inbox, setInbox] = useState<Inbox[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [verifier, setVerifier] = useState("");
  const [caseId, setCaseId] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [serverTime, setServerTime] = useState("");

  async function load() {
    const clock = await api<{ simulatedNow: string; verificationReleasesEnabled: boolean }>("/v1/dev/clock");
    setNow(clock.simulatedNow);
    setFlag(clock.verificationReleasesEnabled);
    const box = await api<{ messages: Inbox[] }>("/v1/dev/inbox");
    setInbox(box.messages);
    const people = await api<{ contacts: Contact[] }>("/v1/contacts");
    setContacts(people.contacts);
    const health = await api<{ serverTime: string }>("/v1/health");
    setServerTime(health.serverTime);
  }
  useEffect(() => { void load().catch((err) => setError(err instanceof ApiError ? err.message : "Test console is unavailable.")); }, []);

  function showError(err: unknown, fallback: string) {
    setError(err instanceof ApiError ? err.message : fallback);
  }

  async function advance(days: number) {
    setError("");
    try {
      const clock = await api<{ simulatedNow: string }>("/v1/dev/clock", { method: "POST", body: JSON.stringify({ advanceDays: days }) });
      setNow(clock.simulatedNow);
    } catch (err) {
      showError(err, "Could not move the test clock.");
    }
  }

  async function jumpToDue() {
    setError("");
    try {
      const check = await api<{ nextCheckInDueAt: string | null }>("/v1/check-in");
      if (!check.nextCheckInDueAt) return;
      const clock = await api<{ simulatedNow: string }>("/v1/dev/clock", { method: "POST", body: JSON.stringify({ simulatedNow: check.nextCheckInDueAt }) });
      setNow(clock.simulatedNow);
    } catch (err) {
      showError(err, "Could not jump to the check-in due time.");
    }
  }

  async function tick() {
    setError("");
    try {
      const result = await api<{ calendarJobsSent: number; remindersSent: number; simulatedReleasesRecorded: number; verificationJobsSent: number }>("/v1/dev/worker/tick", { method: "POST" });
      setMessage(`Worker finished. Calendar sends: ${result.calendarJobsSent}. Reminders: ${result.remindersSent}. Simulated releases recorded: ${result.simulatedReleasesRecorded}. Review sends: ${result.verificationJobsSent}.`);
      await load();
    } catch (err) {
      showError(err, "The worker could not finish.");
    }
  }

  async function setExact(value: string) {
    setError("");
    const instant = new Date(value);
    if (Number.isNaN(instant.getTime())) {
      setError("Choose a complete date and time.");
      return;
    }
    try {
      await api("/v1/dev/clock", { method: "POST", body: JSON.stringify({ simulatedNow: instant.toISOString() }) });
      await load();
    } catch (err) {
      showError(err, "Could not set that time.");
    }
  }

  return (
    <Shell>
      <h1>Development test console</h1>
      <p className="callout">Developer test clock only. Scheduling, I'm Alive, and the automatic worker use real server time. This clock does not change those. Run worker here uses the simulated clock and can act on records in this database. It does not send real email or SMS. Review release flag: {flag ? "on for this non-production process" : "off"}.</p>
      {error ? <p className="error" role="alert">{error}</p> : null}
      <p>Simulated clock: {now ? formatWhen(now) : "…"}</p>
      <p>Server time: {serverTime ? formatWhen(serverTime) : "…"}</p>
      <p className="muted">The simulated clock stays still until you move it. Use it only to rehearse warnings and deliveries. A normal memory date is checked against the server time above.</p>
      <div className="row">
        <button className="secondary" onClick={() => void jumpToDue()}>Jump to check-in due</button>
        <button className="secondary" onClick={() => void advance(7)}>Advance 7 days</button>
        <button className="secondary" onClick={() => void advance(14)}>Advance 14 days</button>
        <button onClick={() => void tick()}>Run worker</button>
      </div>
      <p className="muted">Jump to the check-in due time and run the worker for the missed-check-in warning. Advance 7 days and run it for the second warning, then 7 more days for the final warning. One more 7-day advance records the test-only release and stores the assigned letter and file names in this inbox for the selected recipients. Nothing is sent to a real inbox or phone. Warnings do not include the letter. Production conditional release stays off.</p>
      <label htmlFor="when">Exact simulated time</label>
      <input id="when" type="datetime-local" onChange={(event) => void setExact(event.target.value)} />
      {message ? <p className="banner">{message}</p> : null}
      <h2>Test-only release review</h2>
      <p className="muted">Opening a review here is a fixture. One statement is not enough. I'm Alive stops an open review.</p>
      <label htmlFor="verifier">Verified verifier</label>
      <select id="verifier" value={verifier} onChange={(event) => setVerifier(event.target.value)}>
        <option value="">Choose</option>
        {contacts.filter((contact) => contact.roles.includes("verifier")).map((contact) => <option key={contact.id} value={contact.id}>{contact.displayName}</option>)}
      </select>
      <div className="row row-gap">
        <button onClick={() => void api<{ case: { id: string } }>("/v1/dev/verification/cases", { method: "POST", body: JSON.stringify({ verifierPersonId: verifier }) }).then((data) => setCaseId(data.case.id)).catch((err) => showError(err, "Could not open a review."))}>Open review</button>
        <button className="secondary" onClick={() => void api(`/v1/dev/verification/cases/${caseId}/attestations`, { method: "POST", body: JSON.stringify({ personId: verifier, position: "believe_deceased" }) }).catch((err) => showError(err, "Could not record that statement."))}>Record statement</button>
      </div>
      {caseId ? <p className="muted">Review id {caseId}. Advance the clock past the 14-day wait, run the worker, then past the 72-hour wait, and run it again.</p> : null}
      <h2>Test inbox</h2>
      <div className="list">
        {inbox.map((message) => (
          <article key={message.id} className="item">
            <strong>{message.templateId}</strong>
            <p className="muted">{message.destination} · {formatWhen(message.createdAt)}</p>
            <p>{message.variables.text}</p>
          </article>
        ))}
      </div>
    </Shell>
  );
}
