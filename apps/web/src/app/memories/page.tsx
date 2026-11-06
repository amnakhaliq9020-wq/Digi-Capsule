"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Shell } from "@/components/Shell";
import { api } from "@/lib/api";

type Memory = { id: string; title: string; status: string; deliveryMode: string };

export default function MemoriesPage() {
  const [memories, setMemories] = useState<Memory[]>([]);
  useEffect(() => { api<{ memories: Memory[] }>("/v1/memories").then((data) => setMemories(data.memories)).catch(() => undefined); }, []);
  return (
    <Shell>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h1>My memories</h1>
        <Link className="button" href="/memories/new">New memory</Link>
      </div>
      <div className="list">
        {memories.length === 0 ? <p className="muted">No memories yet. A draft stays private until you schedule it.</p> : null}
        {memories.map((memory) => (
          <Link key={memory.id} className="item" href={`/memories/${memory.id}`}>
            <strong>{memory.title}</strong>
            <div className="row"><span className="pill">{memory.status}</span><span className="pill">{memory.deliveryMode.replaceAll("_", " ")}</span></div>
          </Link>
        ))}
      </div>
    </Shell>
  );
}
