"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Shell, useTimeZone } from "@/components/Shell";
import { api } from "@/lib/api";
import { formatWhen } from "@/lib/time";

type Delivery = {
  id: string;
  status: string;
  memoryTitle: string;
  occurrenceAt: string;
  sentAt: string | null;
  recipient: { displayName: string; email: string };
  trigger: string | null;
};

type Memory = {
  id: string;
  title: string;
  status: string;
  deliveryMode: string;
  recipients: { displayName: string; email: string }[];
  schedule: { nextRunAt: string | null; timeZone: string } | null;
};

export default function DeliveriesPage() {
  return <Shell><DeliveriesBody /></Shell>;
}

function DeliveriesBody() {
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [waiting, setWaiting] = useState<Memory[]>([]);
  const [ifGone, setIfGone] = useState<Memory[]>([]);
  const [serverTime, setServerTime] = useState("");
  const [testMode, setTestMode] = useState(false);
  const [ready, setReady] = useState(false);
  const timeZone = useTimeZone();

  useEffect(() => {
    Promise.all([
      api<{ deliveries: Delivery[] }>("/v1/deliveries"),
      api<{ memories: Memory[] }>("/v1/memories"),
      api<{ serverTime: string }>("/v1/dashboard"),
      api<{ testMode: boolean }>("/v1/health"),
    ]).then(([sent, memories, dashboard, health]) => {
      setDeliveries(sent.deliveries);
      setWaiting(memories.memories.filter((memory) => memory.deliveryMode === "on_date" && memory.status === "scheduled" && memory.schedule?.nextRunAt));
      setIfGone(memories.memories.filter((memory) => memory.deliveryMode === "if_i_am_gone"));
      setServerTime(dashboard.serverTime);
      setTestMode(health.testMode);
    }).catch(() => undefined).finally(() => setReady(true));
  }, []);

  const clock = serverTime ? new Date(serverTime).getTime() : Date.now();

  return (
    <>
      <h1>Scheduled deliveries</h1>
      <p className="muted">A saved date is not a sent message. The first list is every memory waiting for its date. A row in Sent appears after that time has passed and the worker has run once. Running the worker again does not add another row.</p>

      <section className="section">
        <h2>Saved for a date</h2>
        <div className="list">
          {!ready ? <p className="loading">Loading…</p> : waiting.length === 0 ? <p className="empty">No memory has a delivery date yet. Create a memory and choose Send on a date.</p> : null}
          {waiting.map((memory) => {
            const when = memory.schedule?.nextRunAt ?? "";
            const due = new Date(when).getTime() <= clock;
            return (
              <Link key={memory.id} className="item" href={`/memories/${memory.id}`}>
                <strong>{memory.title}</strong>
                <p className="muted">{memory.recipients.map((person) => `${person.displayName} (${person.email})`).join(", ") || "No recipient yet"}</p>
                <p className="muted">Sends {formatWhen(when, timeZone)} ({memory.schedule?.timeZone}). {due
                  ? testMode
                    ? "This time has passed on the test clock. Open the test console and run the worker once to send it."
                    : "This time has passed. It sends on the next worker run."
                  : "Saved, not sent yet."}</p>
              </Link>
            );
          })}
        </div>
      </section>

      <section className="section">
        <h2>Sent</h2>
        <div className="list">
          {!ready ? <p className="loading">Loading…</p> : deliveries.length === 0 ? <p className="empty">Nothing has been sent yet.</p> : null}
          {deliveries.map((delivery) => (
            <article key={delivery.id} className="item">
              <strong>{delivery.memoryTitle}</strong>
              <p className="muted">{delivery.recipient.displayName} ({delivery.recipient.email})</p>
              <p className="muted">{delivery.trigger === "after_verification" ? "If I am gone" : "On a date"} · {delivery.status === "sent" ? "Sent" : delivery.status.replaceAll("_", " ")} · {formatWhen(delivery.sentAt || delivery.occurrenceAt, timeZone)}</p>
            </article>
          ))}
        </div>
      </section>

      {ifGone.length > 0 ? (
        <section className="section">
          <h2>If I am gone</h2>
          <p className="muted">These memories have no calendar date. A check-in date does not send them.</p>
          <div className="list">
            {ifGone.map((memory) => (
              <Link key={memory.id} className="item" href={`/memories/${memory.id}`}>
                <strong>{memory.title}</strong>
                <p className="muted">{memory.recipients.map((person) => person.displayName).join(", ") || "No recipient yet"} · Saved, not sent yet</p>
              </Link>
            ))}
          </div>
        </section>
      ) : null}
    </>
  );
}
