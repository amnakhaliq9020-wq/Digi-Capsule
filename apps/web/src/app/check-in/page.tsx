"use client";

import { useEffect, useState } from "react";
import { Shell } from "@/components/Shell";
import { api } from "@/lib/api";

type CheckIn = {
  lastCheckInAt: string | null;
  nextCheckInDueAt: string | null;
  status: string;
  warningStage: string;
  daysOverdue: number;
  review: { label: string } | null;
  events: { id: string; type: string; offsetDays: number | null; at: string }[];
};

export default function CheckInPage() {
  const [data, setData] = useState<CheckIn | null>(null);
  const [message, setMessage] = useState("");

  async function load() {
    setData(await api<CheckIn>("/v1/check-in"));
  }
  useEffect(() => { void load().catch(() => undefined); }, []);

  async function alive() {
    const result = await api<{ message: string }>("/v1/check-in", { method: "POST" });
    setMessage(result.message);
    await load();
  }

  return (
    <Shell>
      <h1>Check-in</h1>
      <p className="muted">Pressing I'm Alive only records that you can still sign in. It never sends a memory. Warnings follow the missed check-in, then 7 days, then a final warning 7 days later. A simulated release 7 days after that stays in test mode and does not send a memory.</p>
      {data?.review ? <p className="card">{data.review.label}</p> : null}
      {data ? (
        <div className="grid">
          <article className="card stat"><span>Last check-in</span><strong style={{ fontSize: "1.05rem" }}>{data.lastCheckInAt ? new Date(data.lastCheckInAt).toLocaleString() : "None yet"}</strong></article>
          <article className="card stat"><span>Next due</span><strong style={{ fontSize: "1.05rem" }}>{data.nextCheckInDueAt ? new Date(data.nextCheckInDueAt).toLocaleString() : "—"}</strong></article>
          <article className="card stat"><span>Status</span><strong style={{ fontSize: "1.05rem" }}>{data.status}{data.daysOverdue ? ` · ${data.daysOverdue} days` : ""}</strong></article>
          <article className="card stat"><span>Warning stage</span><strong style={{ fontSize: "1.05rem" }}>{data.warningStage.replaceAll("_", " ")}</strong></article>
        </div>
      ) : null}
      <p style={{ marginTop: 18 }}><button className="alive" onClick={() => void alive()}>I'm Alive</button></p>
      {message ? <p className="card">{message}</p> : null}
    </Shell>
  );
}
