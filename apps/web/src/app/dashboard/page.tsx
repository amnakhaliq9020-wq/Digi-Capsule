"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Shell, useTimeZone } from "@/components/Shell";
import { ApiError, api } from "@/lib/api";
import { deliveryModeLabel, formatWhen, memoryStatusLabel } from "@/lib/time";

type Dashboard = {
  totalMemories: number;
  drafts: number;
  scheduled: number;
  ifIAmGone: number;
  nextScheduledDelivery: string | null;
  lastCheckInAt: string | null;
  nextCheckInDueAt: string | null;
  accountCheckStatus: string;
  escalationStatus: string;
  confirmationRequestedAt: string | null;
  confirmationDeadline: string | null;
  pausedUntil: string | null;
  warningStatus: string;
};

type Memory = { id: string; title: string; status: string; deliveryMode: string };
type Received = { id: string; title: string; body: string };
type Contact = { id: string; displayName: string; email: string | null; phone: string | null; roles: string[] };

function when(value: string | null, timeZone: string) {
  return value ? formatWhen(value, timeZone) : "Not yet";
}

export default function DashboardPage() {
  return <Shell><DashboardBody /></Shell>;
}

function DashboardBody() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [memories, setMemories] = useState<Memory[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [received, setReceived] = useState<Received[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [checkMessage, setCheckMessage] = useState("");
  const timeZone = useTimeZone();

  useEffect(() => {
    Promise.all([
      api<Dashboard>("/v1/dashboard"),
      api<{ memories: Memory[] }>("/v1/memories"),
      api<{ contacts: Contact[] }>("/v1/contacts"),
      api<{ memories: Received[] }>("/v1/received"),
    ]).then(([summary, memoryList, contactList, receivedList]) => {
      setData(summary);
      setMemories(memoryList.memories);
      setContacts(contactList.contacts);
      setReceived(receivedList.memories);
    }).catch((err) => setError(err instanceof ApiError ? err.message : "Could not load the dashboard.")).finally(() => setReady(true));
  }, []);

  const trusted = contacts.filter((contact) => contact.roles?.includes("trusted_contact")).length;

  async function alive() {
    setError("");
    try {
      const result = await api<{ message: string }>("/v1/check-in", { method: "POST" });
      setCheckMessage(result.message);
      setData(await api<Dashboard>("/v1/dashboard"));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not record the check-in.");
    }
  }

  return (
    <>
      <h1>What would you like to do today?</h1>
      <p className="muted">Your account holds one capsule. A memory stays private until you choose who receives it and when. A check-in does not send a memory.</p>
      <div className="action-grid">
        <Link className="action" href="/memories/new">Create a Memory</Link>
        <Link className="action" href="/memories/new#delivery">Create a Future Message</Link>
        <Link className="action quiet" href="/memories">View My Capsules</Link>
        <Link className="action quiet" href="/contacts">Manage Trusted Contacts</Link>
      </div>
      {error ? <p className="error" role="alert">{error}</p> : null}
      {data ? (
        <div className="grid">
          <article className="card stat"><span>Total memories</span><strong>{data.totalMemories}</strong></article>
          <article className="card stat"><span>Active capsules</span><strong>1</strong><p className="muted">One capsule holds every memory on this account.</p></article>
          <article className="card stat"><span>Upcoming deliveries</span><strong>{data.scheduled}</strong><p className="muted">Next: {when(data.nextScheduledDelivery, timeZone)} ({timeZone})</p></article>
          <article className="card stat"><span>Trusted contacts</span><strong>{trusted}</strong></article>
        </div>
      ) : <p className="loading">Loading…</p>}
      <section className="section">
        <h2>Account activity</h2>
        <p className="muted">Last check-in: {data ? when(data.lastCheckInAt, timeZone) : "Loading…"}. Next check-in: {data ? when(data.nextCheckInDueAt, timeZone) : "Loading…"} ({timeZone}). Status: {data ? data.accountCheckStatus.replaceAll("_", " ") : "Loading…"}. {data?.confirmationDeadline ? `Confirmation deadline: ${when(data.confirmationDeadline, timeZone)} (${timeZone}).` : "No confirmation window is open."} {data?.escalationStatus && data.escalationStatus !== "none" ? `Escalation: ${data.escalationStatus.replaceAll("_", " ")}.` : ""} A missed check-in is not a finding of death, and this button does not send a memory.</p>
        <p className="actions">
          <button className="alive" onClick={() => void alive()}>I'm Active</button>
          <Link className="button secondary" href="/check-in">Check-in details</Link>
        </p>
        {checkMessage ? <p className="banner">{checkMessage}</p> : null}
      </section>

      <section className="section">
        <div className="section-head">
          <h2>Memories</h2>
          <Link href="/memories">Open all</Link>
        </div>
        <div className="list">
          {!ready ? <p className="loading">Loading…</p> : memories.length === 0 ? <p className="empty">No memories yet. A letter or video stays private until you choose a delivery rule.</p> : null}
          {memories.slice(0, 5).map((memory) => (
            <Link key={memory.id} className="item" href={`/memories/${memory.id}`}>
              <strong>{memory.title}</strong>
              <div className="row"><span className="pill">{memoryStatusLabel(memory.status)}</span><span className="pill">{deliveryModeLabel(memory.deliveryMode)}</span></div>
            </Link>
          ))}
        </div>
      </section>

      <section className="section">
        <h2>Shared with you</h2>
        <div className="list">
          {!ready ? <p className="loading">Loading…</p> : received.length === 0 ? <p className="empty">Nothing has been released to this account.</p> : null}
          {received.map((memory) => (
            <Link key={memory.id} className="item" href={`/memories/${memory.id}`}>
              <strong>{memory.title}</strong>
              <p className="muted">{memory.body || "This memory has no letter."}</p>
            </Link>
          ))}
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <h2>Contacts</h2>
          <Link href="/contacts">Manage contacts</Link>
        </div>
        <div className="list">
          {!ready ? <p className="loading">Loading…</p> : contacts.length === 0 ? <p className="empty">No contacts yet. Add a name, email, and phone before you schedule a memory.</p> : null}
          {contacts.slice(0, 5).map((contact) => (
            <article key={contact.id} className="item">
              <strong>{contact.displayName}</strong>
              <p className="muted">{contact.email || "No email"} · {contact.phone || "No phone"}</p>
            </article>
          ))}
        </div>
      </section>
    </>
  );
}
