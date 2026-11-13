"use client";

import { useEffect, useState } from "react";
import { Shell, useTimeZone } from "@/components/Shell";
import { Status } from "@/components/Status";
import { ApiError, api } from "@/lib/api";
import { formatWhen } from "@/lib/time";

type CheckIn = {
  lastCheckInAt: string | null;
  nextCheckInDueAt: string | null;
  status: string;
  warningStage: string;
  daysOverdue: number;
  review: { label: string } | null;
  accountCheckStatus: string;
  escalationStatus: string;
  confirmationDeadline: string | null;
  events: { id: string; type: string; offsetDays: number | null; at: string }[];
};

export default function CheckInPage() {
  return <Shell><CheckInBody /></Shell>;
}

function CheckInBody() {
  const [data, setData] = useState<CheckIn | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const timeZone = useTimeZone();

  async function load() {
    setData(await api<CheckIn>("/v1/check-in"));
  }
  useEffect(() => { void load().catch((err) => setError(err instanceof ApiError ? err.message : "Could not load the check-in.")); }, []);

  async function pause() {
    setError("");
    try {
      const result = await api<{ message: string }>("/v1/check-in/pause", { method: "POST" });
      setMessage(result.message);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not pause the check-in.");
    }
  }

  async function resume() {
    setError("");
    try {
      const result = await api<{ message: string }>("/v1/check-in/resume", { method: "POST" });
      setMessage(result.message);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not resume the check-in.");
    }
  }

  async function alive() {
    setError("");
    try {
      const result = await api<{ message: string }>("/v1/check-in", { method: "POST" });
      setMessage(result.message);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not record the check-in.");
    }
  }

  return (
    <>
      <h1>Check-in</h1>
      {error ? <p className="error" role="alert">{error}</p> : null}
      <p className="muted">Pressing I'm Alive records the server time and sets the next check-in 30 days later. Times are shown in {timeZone}. It never sends a memory. If 30 days pass, the server emails a single-use confirmation link and opens another 30-day window. Reminders follow at 7 and 14 days, with a final warning 7 days before that window ends. Reaching the end records an escalation for review. It does not decide that you have died and it does not release memories.</p>
      {data?.review ? <p className="callout-warn card">{data.review.label}</p> : null}
      {data ? (
        <div className="grid">
          <article className="card stat"><span>Last check-in</span><strong>{data.lastCheckInAt ? formatWhen(data.lastCheckInAt, timeZone) : "None yet"}</strong></article>
          <article className="card stat"><span>Next due</span><strong>{data.nextCheckInDueAt ? `${formatWhen(data.nextCheckInDueAt, timeZone)} (${timeZone})` : "Not yet"}</strong></article>
          <article className="card stat"><span>Status</span><strong><Status kind={data.status === "overdue" ? "warning" : "success"}>{data.status === "overdue" ? "Check-in is overdue" : "Check-in is on time"}</Status>{data.daysOverdue ? ` ${data.daysOverdue} days past due` : ""}</strong></article>
          <article className="card stat"><span>Warning stage</span><strong>{data.warningStage.replaceAll("_", " ")}</strong></article>
          <article className="card stat"><span>Confirmation status</span><strong>{data.accountCheckStatus.replaceAll("_", " ")}</strong></article>
          <article className="card stat"><span>Confirmation deadline</span><strong>{data.confirmationDeadline ? `${formatWhen(data.confirmationDeadline, timeZone)} (${timeZone})` : "Not open"}</strong></article>
          <article className="card stat"><span>Escalation</span><strong>{data.escalationStatus.replaceAll("_", " ")}</strong></article>
        </div>
      ) : <p className="loading">Loading…</p>}
      <p className="actions">
        <button className="alive" onClick={() => void alive()}>I'm Alive</button>
        <button className="secondary" onClick={() => void pause()}>Pause warnings for 30 days</button>
        <button className="secondary" onClick={() => void resume()}>Resume warnings</button>
      </p>
      {message ? <p className="banner">{message}</p> : null}
    </>
  );
}
