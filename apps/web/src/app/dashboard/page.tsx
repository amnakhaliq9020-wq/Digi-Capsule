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

function when(value: string | null) {
  return value ? new Date(value).toLocaleString() : "Not yet";
}

export default function DashboardPage() {
  const [data, setData] = useState<Dashboard | null>(null);
  useEffect(() => { api<Dashboard>("/v1/dashboard").then(setData).catch(() => undefined); }, []);
  return (
    <Shell>
      <h1>Dashboard</h1>
      <p className="muted">A quiet summary of your memories and your next check-in.</p>
      {data ? (
        <div className="grid">
          <article className="card stat"><span>Total memories</span><strong>{data.totalMemories}</strong></article>
          <article className="card stat"><span>Drafts</span><strong>{data.drafts}</strong></article>
          <article className="card stat"><span>Scheduled</span><strong>{data.scheduled}</strong></article>
          <article className="card stat"><span>If I am gone</span><strong>{data.ifIAmGone}</strong></article>
          <article className="card stat"><span>Next scheduled delivery</span><strong style={{ fontSize: "1.05rem" }}>{when(data.nextScheduledDelivery)}</strong></article>
          <article className="card stat"><span>Last check-in</span><strong style={{ fontSize: "1.05rem" }}>{when(data.lastCheckInAt)}</strong></article>
          <article className="card stat"><span>Next check-in</span><strong style={{ fontSize: "1.05rem" }}>{when(data.nextCheckInDueAt)}</strong></article>
          <article className="card stat"><span>Warning status</span><strong style={{ fontSize: "1.05rem" }}>{data.warningStatus.replaceAll("_", " ")}</strong></article>
        </div>
      ) : <p>Loading…</p>}
      <p style={{ marginTop: 18 }}><Link className="button" href="/check-in">Open check-in</Link></p>
    </Shell>
  );
}
