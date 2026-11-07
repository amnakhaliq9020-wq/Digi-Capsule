"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Shell } from "@/components/Shell";
import { api } from "@/lib/api";
import { deliveryModeLabel, memoryStatusLabel } from "@/lib/time";

type Memory = { id: string; title: string; status: string; deliveryMode: string };

export default function MemoriesPage() {
  const [memories, setMemories] = useState<Memory[]>([]);
  const [ready, setReady] = useState(false);
  useEffect(() => { api<{ memories: Memory[] }>("/v1/memories").then((data) => setMemories(data.memories)).catch(() => undefined).finally(() => setReady(true)); }, []);
  return (
    <Shell>
      <div className="section-head">
        <h1>My memories</h1>
        <Link className="button" href="/memories/new">New memory</Link>
      </div>
      <div className="list">
        {!ready ? <p className="loading">Loading…</p> : memories.length === 0 ? <p className="empty">No memories yet. A draft stays private until you schedule it.</p> : null}
        {memories.map((memory) => (
          <Link key={memory.id} className="item" href={`/memories/${memory.id}`}>
            <strong>{memory.title}</strong>
            <div className="row"><span className="pill">{memoryStatusLabel(memory.status)}</span><span className="pill">{deliveryModeLabel(memory.deliveryMode)}</span></div>
          </Link>
        ))}
      </div>
    </Shell>
  );
}
