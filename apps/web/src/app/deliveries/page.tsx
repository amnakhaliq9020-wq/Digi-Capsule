"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Shell, useTimeZone } from "@/components/Shell";
import { Status, statusKindFor } from "@/components/Status";
import { ApiError, api } from "@/lib/api";
import { civilDateLabel, civilTimeLabel, formatWhen, waitingDeliveryNote } from "@/lib/time";

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
  schedule: { nextRunAt: string | null; timeZone: string; localDate: string | null; localTime: string | null } | null;
  recipientDeliveries?: { id: string; displayName: string; timeZone: string; localDate: string | null; localTime: string | null; occursAt: string | null; deliveryStatus: string }[];
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
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const timeZone = useTimeZone();

  function load() {
    return Promise.all([
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
    }).catch((err) => setError(err instanceof ApiError ? err.message : "Could not load deliveries.")).finally(() => setReady(true));
  }

  useEffect(() => {
    void load();
  }, []);

  async function cancelDelivery(memory: Memory) {
    const confirmed = window.confirm(`Cancel the delivery of “${memory.title}”? The memory stays in your capsule. A message the email provider already accepted cannot be recalled.`);
    if (!confirmed) return;
    setError("");
    setNotice("");
    try {
      const result = await api<{ message?: string }>(`/v1/memories/${memory.id}/cancel`, { method: "POST" });
      setNotice(result.message || "Delivery cancelled. The memory is still in your capsule.");
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not cancel this delivery.");
    }
  }

  const clock = serverTime ? new Date(serverTime).getTime() : Date.now();

  return (
    <>
      <h1>Scheduled messages</h1>
      <p className="muted">A saved date is not a sent message. The first list is every memory waiting for its date. A row in Sent appears after that time has passed and the worker has run once. Running the worker again does not add another row.</p>
      {error ? <p className="error" role="alert">{error}</p> : null}
      {notice ? <p className="ok" role="status">{notice}</p> : null}

      <section className="section">
        <h2>Saved for a date</h2>
        <div className="list">
          {!ready ? <p className="loading">Loading…</p> : waiting.length === 0 ? <p className="empty">No memory has a delivery date yet. Create a memory and choose Send on a date.</p> : null}
          {waiting.map((memory) => {
            const when = memory.schedule?.nextRunAt ?? "";
            const due = new Date(when).getTime() <= clock;
            return (
              <article key={memory.id} className="item">
                <Link href={`/memories/${memory.id}`}><strong>{memory.title}</strong></Link>
                <p className="muted">{memory.recipients.map((person) => `${person.displayName} (${person.email})`).join(", ") || "No recipient yet"}</p>
                {memory.recipientDeliveries && memory.recipientDeliveries.length > 0 ? memory.recipientDeliveries.map((row) => (
                  <p key={row.id} className="muted">Scheduled date: {row.localDate ? civilDateLabel(row.localDate) : "Not set"}. Scheduled local time: {row.localTime ? civilTimeLabel(row.localTime) : "9:00 am"}. Recipient time zone: {row.displayName}, {row.timeZone}. Schedule status: scheduled. Delivery status: Pending. {waitingDeliveryNote(Boolean(row.occursAt) && new Date(row.occursAt!).getTime() <= clock, testMode)}</p>
                )) : (
                  <p className="muted">Scheduled date: {memory.schedule?.localDate ? civilDateLabel(memory.schedule.localDate) : formatWhen(when, timeZone)}. Scheduled local time: {memory.schedule?.localTime ? civilTimeLabel(memory.schedule.localTime) : "9:00 am"}. Recipient time zone: {memory.schedule?.timeZone}. Schedule status: scheduled. Delivery status: Pending. {waitingDeliveryNote(due, testMode)}</p>
                )}
                <div className="row">
                  <Link className="button" href={`/memories/${memory.id}/edit#delivery`}>Edit delivery</Link>
                  <button className="secondary" type="button" onClick={() => void cancelDelivery(memory)}>Cancel delivery</button>
                </div>
              </article>
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
              <p className="muted">{delivery.trigger === "after_verification" ? "If I am gone" : "On a date"} · <Status kind={delivery.status === "sent" ? "delivered" : statusKindFor(delivery.status)}>{delivery.status === "sent" ? "Sent" : delivery.status.replaceAll("_", " ")}</Status> · {formatWhen(delivery.sentAt || delivery.occurrenceAt, timeZone)}</p>
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
