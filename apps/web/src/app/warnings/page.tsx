"use client";

import { useEffect, useState } from "react";
import { WARNING_MESSAGES } from "@digi/shared";
import { Shell, useTimeZone } from "@/components/Shell";
import { api } from "@/lib/api";
import { formatWhen } from "@/lib/time";

type Event = { id: string; type: string; offsetDays: number | null; at: string };

const stages = [
  WARNING_MESSAGES.missed_check_in,
  WARNING_MESSAGES.second_warning,
  WARNING_MESSAGES.final_warning,
] as const;

export default function WarningsPage() {
  return <Shell><WarningsBody /></Shell>;
}

function WarningsBody() {
  const [events, setEvents] = useState<Event[]>([]);
  const [stage, setStage] = useState("on_time");
  const [ready, setReady] = useState(false);
  const timeZone = useTimeZone();
  useEffect(() => {
    api<{ events: Event[]; warningStage: string }>("/v1/check-in").then((data) => {
      setEvents(data.events);
      setStage(data.warningStage);
    }).catch(() => undefined).finally(() => setReady(true));
  }, []);
  return (
    <>
      <h1>Warning history</h1>
      <p>Current stage: {ready ? <span className={stage === "on_time" ? "pill" : "pill pill-warn"}>{stage.replaceAll("_", " ")}</span> : <span className="loading">Loading…</span>}</p>
      <p className="muted">A missed check-in sends a warning, another 7 days later, and a final warning 7 days after that. Those three messages do not include a memory. In the test console, 7 more days stores the assigned memory for its recipients in the local test inbox only. An unanswered check-in is not proof of death, and production does not send that memory.</p>
      <div className="stack">
        {stages.map((item) => (
          <article key={item.label} className="card stack callout-warn">
            <h2>{item.label}</h2>
            <p><strong>Email.</strong> {item.email}</p>
            <p><strong>SMS.</strong> {item.sms}</p>
            <p className="muted">Email is recorded for the author. The same warning is also stored as an SMS mock to sms-mock, not to a phone network.</p>
          </article>
        ))}
      </div>
      <div className="list section">
        {!ready ? <p className="loading">Loading…</p> : events.length === 0 ? <p className="empty">No warnings have been recorded for the current check-in.</p> : null}
        {events.map((event) => (
          <article key={event.id} className="item">
            <strong>{event.type.replaceAll("_", " ")}</strong>
            <p className="muted">{event.offsetDays === null ? "Check-in" : `${event.offsetDays} days after the due time`} · {formatWhen(event.at, timeZone)}</p>
          </article>
        ))}
      </div>
    </>
  );
}
