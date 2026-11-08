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
  warningStatus: string;
};

type Memory = { id: string; title: string; status: string; deliveryMode: string };
type Contact = { id: string; displayName: string; email: string | null; phone: string | null };

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
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const timeZone = useTimeZone();

  useEffect(() => {
    Promise.all([
      api<Dashboard>("/v1/dashboard"),
      api<{ memories: Memory[] }>("/v1/memories"),
      api<{ contacts: Contact[] }>("/v1/contacts"),
    ]).then(([summary, memoryList, contactList]) => {
      setData(summary);
      setMemories(memoryList.memories);
      setContacts(contactList.contacts);
    }).catch((err) => setError(err instanceof ApiError ? err.message : "Could not load the dashboard.")).finally(() => setReady(true));
  }, []);

  return (
    <>
      <h1>Dashboard</h1>
      <p className="muted">Saved for a date counts memories with a send date. Those memories are listed under Scheduled deliveries until they are sent. Check-in dates are a separate timer and do not send a memory.</p>
      {error ? <p className="error" role="alert">{error}</p> : null}
      {data ? (
        <div className="grid">
          <article className="card stat"><span>Total memories</span><strong>{data.totalMemories}</strong></article>
          <article className="card stat"><span>Drafts</span><strong>{data.drafts}</strong></article>
          <article className="card stat"><span>Saved for a date</span><strong>{data.scheduled}</strong></article>
          <article className="card stat"><span>If I am gone</span><strong>{data.ifIAmGone}</strong></article>
          <article className="card stat"><span>Next send</span><strong>{when(data.nextScheduledDelivery, timeZone)}</strong></article>
          <article className="card stat"><span>Last I'm Alive</span><strong>{when(data.lastCheckInAt, timeZone)}</strong></article>
          <article className="card stat"><span>Next check-in due</span><strong>{when(data.nextCheckInDueAt, timeZone)}</strong></article>
          <article className="card stat"><span>Warning status</span><strong>{data.warningStatus.replaceAll("_", " ")}</strong></article>
        </div>
      ) : <p className="loading">Loading…</p>}
      <p className="actions"><Link className="button" href="/check-in">I'm Alive</Link></p>

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
