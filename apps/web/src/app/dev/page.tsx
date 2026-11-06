"use client";

import { useEffect, useState } from "react";
import { Shell } from "@/components/Shell";
import { ApiError, api } from "@/lib/api";

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

  async function load() {
    const clock = await api<{ simulatedNow: string; verificationReleasesEnabled: boolean }>("/v1/dev/clock");
    setNow(clock.simulatedNow);
    setFlag(clock.verificationReleasesEnabled);
    const box = await api<{ messages: Inbox[] }>("/v1/dev/inbox");
    setInbox(box.messages);
    const people = await api<{ contacts: Contact[] }>("/v1/contacts");
    setContacts(people.contacts);
  }
  useEffect(() => { void load().catch((err) => setError(err instanceof ApiError ? err.message : "Test console is unavailable.")); }, []);

  async function advance(days: number) {
    const clock = await api<{ simulatedNow: string }>("/v1/dev/clock", { method: "POST", body: JSON.stringify({ advanceDays: days }) });
    setNow(clock.simulatedNow);
  }

  async function tick() {
    const result = await api<{ calendarJobsSent: number; remindersSent: number; simulatedReleasesRecorded: number; verificationJobsSent: number }>("/v1/dev/worker/tick", { method: "POST" });
    setMessage(`Worker finished. Calendar sends: ${result.calendarJobsSent}. Reminders: ${result.remindersSent}. Simulated releases recorded: ${result.simulatedReleasesRecorded}. Review sends: ${result.verificationJobsSent}.`);
    await load();
  }

  return (
    <Shell>
      <h1>Development test console</h1>
      <p className="card">Synthetic data only. This console cannot change the production clock, and death-related delivery stays off when NODE_ENV is production. Current review release flag: {flag ? "on for this non-production process" : "off"}.</p>
      {error ? <p className="error">{error}</p> : null}
      <p>Simulated time: {now ? new Date(now).toLocaleString() : "…"}</p>
      <div className="row">
        <button className="secondary" onClick={() => void advance(7)}>Advance 7 days</button>
        <button onClick={() => void tick()}>Run worker</button>
      </div>
      <p className="muted">Set the clock to the check-in due time and run the worker for the missed-check-in warning. Advance 7 days and run the worker for the second warning, again for the final warning, and again for the test-only simulated release. That last step does not send a memory. Production conditional release stays off.</p>
      <label htmlFor="when">Exact simulated time</label>
      <input id="when" type="datetime-local" onChange={(event) => void api("/v1/dev/clock", { method: "POST", body: JSON.stringify({ simulatedNow: new Date(event.target.value).toISOString() }) }).then(load)} />
      {message ? <p>{message}</p> : null}
      <h2>Test-only release review</h2>
      <p className="muted">Opening a review here is a fixture. One statement is not enough. I'm Alive stops an open review.</p>
      <label htmlFor="verifier">Verified verifier</label>
      <select id="verifier" value={verifier} onChange={(event) => setVerifier(event.target.value)}>
        <option value="">Choose</option>
        {contacts.filter((contact) => contact.roles.includes("verifier")).map((contact) => <option key={contact.id} value={contact.id}>{contact.displayName}</option>)}
      </select>
      <div className="row" style={{ marginTop: 12 }}>
        <button onClick={() => void api<{ case: { id: string } }>("/v1/dev/verification/cases", { method: "POST", body: JSON.stringify({ verifierPersonId: verifier }) }).then((data) => setCaseId(data.case.id))}>Open review</button>
        <button className="secondary" onClick={() => void api(`/v1/dev/verification/cases/${caseId}/attestations`, { method: "POST", body: JSON.stringify({ personId: verifier, position: "believe_deceased" }) })}>Record statement</button>
      </div>
      {caseId ? <p className="muted">Review id {caseId}. Advance the clock past the 14-day wait, run the worker, then past the 72-hour wait, and run it again.</p> : null}
      <h2>Test inbox</h2>
      <div className="list">
        {inbox.map((message) => (
          <article key={message.id} className="item">
            <strong>{message.templateId}</strong>
            <p className="muted">{message.destination} · {new Date(message.createdAt).toLocaleString()}</p>
            <p>{message.variables.text}</p>
          </article>
        ))}
      </div>
    </Shell>
  );
}
