"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Shell } from "@/components/Shell";
import { api } from "@/lib/api";
import { deliveryModeLabel, memoryStatusLabel } from "@/lib/time";

type Memory = { id: string; title: string; status: string; deliveryMode: string };

export default function MemoriesPage() {
  const [memories, setMemories] = useState<Memory[]>([]);
  const [query, setQuery] = useState("");
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("q") ?? "";
    setQuery(requested);
    api<{ memories: Memory[] }>("/v1/memories").then((data) => setMemories(data.memories)).catch(() => undefined).finally(() => setReady(true));
  }, []);
  const shown = memories.filter((memory) => memory.title.toLowerCase().includes(query.trim().toLowerCase()));
  return (
    <Shell>
      <div className="section-head">
        <h1>My memories</h1>
        <Link className="button" href="/memories/new">Create a Memory</Link>
      </div>
      <p className="muted">Each memory lives in your one capsule. A draft stays private until you choose a person and a delivery.</p>
      <form className="stack" role="search" onSubmit={(event) => event.preventDefault()}>
        <label className="sr-only" htmlFor="filter-memories">Filter memories by title</label>
        <input id="filter-memories" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filter by title" />
      </form>
      <div className="list">
        {!ready ? <p className="loading">Loading…</p> : memories.length === 0 ? <p className="empty">No memories yet. A draft stays private until you schedule it.</p> : null}
        {ready && memories.length > 0 && shown.length === 0 ? <p className="empty">No memory title matches that search.</p> : null}
        {shown.map((memory) => (
          <Link key={memory.id} className="item" href={`/memories/${memory.id}`}>
            <strong>{memory.title}</strong>
            <div className="row"><span className="pill">{memoryStatusLabel(memory.status)}</span><span className="pill">{deliveryModeLabel(memory.deliveryMode)}</span></div>
          </Link>
        ))}
      </div>
    </Shell>
  );
}
