"use client";

import { useEffect, useState } from "react";
import { Shell } from "@/components/Shell";
import { api } from "@/lib/api";

type Event = { id: string; type: string; offsetDays: number | null; at: string };

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
      <p className="muted">A missed check-in sends a warning, another 7 days later, and a final warning 7 days after that. In test mode, 7 more days records a simulated conditional release. That step does not send a memory. An unanswered check-in is not proof of death. SMS is disabled.</p>
      <div className="list">
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
