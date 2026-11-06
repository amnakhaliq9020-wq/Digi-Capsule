"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Shell } from "@/components/Shell";
import { api } from "@/lib/api";

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

function when(value: string | null) {
  return value ? new Date(value).toLocaleString() : "Not yet";
}

export default function DashboardPage() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [memories, setMemories] = useState<Memory[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);

  useEffect(() => {
    Promise.all([
      api<Dashboard>("/v1/dashboard"),
      api<{ memories: Memory[] }>("/v1/memories"),
      api<{ contacts: Contact[] }>("/v1/contacts"),
    ]).then(([summary, memoryList, contactList]) => {
      setData(summary);
      setMemories(memoryList.memories);
      setContacts(contactList.contacts);
    }).catch(() => undefined);
  }, []);

  return (
    <Shell>
      <h1>Dashboard</h1>
      <p className="muted">Your last I'm Alive press, the next due time, and the memories and contacts saved on this account.</p>
      {data ? (
        <div className="grid">
          <article className="card stat"><span>Total memories</span><strong>{data.totalMemories}</strong></article>
          <article className="card stat"><span>Drafts</span><strong>{data.drafts}</strong></article>
          <article className="card stat"><span>Scheduled</span><strong>{data.scheduled}</strong></article>
          <article className="card stat"><span>If I am gone</span><strong>{data.ifIAmGone}</strong></article>
          <article className="card stat"><span>Next scheduled delivery</span><strong style={{ fontSize: "1.05rem" }}>{when(data.nextScheduledDelivery)}</strong></article>
          <article className="card stat"><span>Last I'm Alive</span><strong style={{ fontSize: "1.05rem" }}>{when(data.lastCheckInAt)}</strong></article>
          <article className="card stat"><span>Next check-in due</span><strong style={{ fontSize: "1.05rem" }}>{when(data.nextCheckInDueAt)}</strong></article>
          <article className="card stat"><span>Warning status</span><strong style={{ fontSize: "1.05rem" }}>{data.warningStatus.replaceAll("_", " ")}</strong></article>
        </div>
      ) : <p>Loading…</p>}
      <p style={{ marginTop: 18 }}><Link className="button" href="/check-in">I'm Alive</Link></p>

      <section className="stack" style={{ marginTop: 28 }}>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h2>Memories</h2>
          <Link href="/memories">Open all</Link>
        </div>
        <div className="list">
          {memories.length === 0 ? <p className="card muted">No memories yet. A letter or video stays private until you choose a delivery rule.</p> : null}
          {memories.slice(0, 5).map((memory) => (
            <Link key={memory.id} className="item" href={`/memories/${memory.id}`}>
              <strong>{memory.title}</strong>
              <div className="row"><span className="pill">{memory.status}</span><span className="pill">{memory.deliveryMode.replaceAll("_", " ")}</span></div>
            </Link>
          ))}
        </div>
      </section>

      <section className="stack" style={{ marginTop: 28 }}>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h2>Contacts</h2>
          <Link href="/contacts">Manage contacts</Link>
        </div>
        <div className="list">
          {contacts.length === 0 ? <p className="card muted">No contacts yet. Add a name, email, and phone before you schedule a memory.</p> : null}
          {contacts.slice(0, 5).map((contact) => (
            <article key={contact.id} className="item">
              <strong>{contact.displayName}</strong>
              <p className="muted">{contact.email || "No email"} · {contact.phone || "No phone"}</p>
            </article>
          ))}
        </div>
      </section>
    </Shell>
  );
}
