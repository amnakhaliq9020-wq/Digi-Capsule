"use client";

import { useEffect, useState } from "react";
import { WARNING_MESSAGES } from "@digi/shared";
import { Shell } from "@/components/Shell";
import { api } from "@/lib/api";

type Event = { id: string; type: string; offsetDays: number | null; at: string };

const stages = [
  WARNING_MESSAGES.missed_check_in,
  WARNING_MESSAGES.second_warning,
  WARNING_MESSAGES.final_warning,
] as const;

export default function WarningsPage() {
  const [events, setEvents] = useState<Event[]>([]);
  const [stage, setStage] = useState("on_time");
  useEffect(() => {
    api<{ events: Event[]; warningStage: string }>("/v1/check-in").then((data) => {
      setEvents(data.events);
      setStage(data.warningStage);
    }).catch(() => undefined);
  }, []);
  return (
    <Shell>
      <h1>Warning history</h1>
      <p>Current stage: <span className="pill">{stage.replaceAll("_", " ")}</span></p>
      <p className="muted">A missed check-in sends a warning, another 7 days later, and a final warning 7 days after that. In test mode, 7 more days records a simulated conditional release. That step does not send a memory. An unanswered check-in is not proof of death.</p>
      <div className="stack" style={{ marginTop: 18 }}>
        {stages.map((item) => (
          <article key={item.label} className="card stack">
            <h2>{item.label}</h2>
            <p><strong>Email.</strong> {item.email}</p>
            <p><strong>SMS.</strong> {item.sms}</p>
            <p className="muted">SMS uses this wording and is not sent in Phase 1. Email is the message the worker records.</p>
          </article>
        ))}
      </div>
      <div className="list" style={{ marginTop: 18 }}>
        {events.length === 0 ? <p className="muted">No warnings have been recorded for the current check-in.</p> : null}
        {events.map((event) => (
          <article key={event.id} className="item">
            <strong>{event.type.replaceAll("_", " ")}</strong>
            <p className="muted">{event.offsetDays === null ? "Check-in" : `${event.offsetDays} days after the due time`} · {new Date(event.at).toLocaleString()}</p>
          </article>
        ))}
      </div>
    </Shell>
  );
}
