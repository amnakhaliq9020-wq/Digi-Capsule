"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Shell } from "@/components/Shell";
import { ApiError, api } from "@/lib/api";

type Memory = {
  id: string;
  title: string;
  body: string;
  status: string;
  deliveryMode: string;
  recipients: { id: string; displayName: string; email: string }[];
  attachments: { id: string; kind: "photo" | "video"; originalName: string }[];
  schedule: { localDate: string | null; localTime: string | null; timeZone: string; nextRunAt: string | null } | null;
  delivery: { sent: number; failed: boolean; pending: boolean };
};

export default function MemoryDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [memory, setMemory] = useState<Memory | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api<{ memory: Memory }>(`/v1/memories/${params.id}`).then((data) => setMemory(data.memory)).catch((err) => setError(err instanceof ApiError ? err.message : "Not found."));
  }, [params.id]);

  async function cancel() {
    await api(`/v1/memories/${params.id}/cancel`, { method: "POST" });
    router.refresh();
    const data = await api<{ memory: Memory }>(`/v1/memories/${params.id}`);
    setMemory(data.memory);
  }

  async function remove() {
    await api(`/v1/memories/${params.id}`, { method: "DELETE" });
    router.push("/memories");
  }

  return (
    <Shell>
      {error ? <p className="error">{error}</p> : null}
      {memory ? (
        <article className="stack">
          <div className="row"><h1>{memory.title}</h1><span className="pill">{memory.status}</span><span className="pill">{memory.deliveryMode.replaceAll("_", " ")}</span></div>
          <p style={{ whiteSpace: "pre-wrap" }}>{memory.body}</p>
          <p className="muted">Recipients: {memory.recipients.map((person) => `${person.displayName} (${person.email})`).join(", ") || "None yet"}</p>
          {memory.schedule?.nextRunAt ? <p className="muted">Scheduled for {new Date(memory.schedule.nextRunAt).toLocaleString()} ({memory.schedule.timeZone}).</p> : null}
          <p className="muted">Delivery status: {memory.delivery.sent > 0 ? `${memory.delivery.sent} sent` : memory.status === "scheduled" ? "Waiting" : memory.status}</p>
          <div className="media-grid">
            {memory.attachments.map((file) => file.kind === "video"
              ? <video key={file.id} src={`/v1/media/${file.id}/content`} controls />
              : <img key={file.id} src={`/v1/media/${file.id}/content`} alt={file.originalName} />)}
          </div>
          {memory.status !== "released" ? (
            <div className="row">
              <Link className="button" href={`/memories/${memory.id}/edit`}>Edit</Link>
              {memory.status === "scheduled" ? <button className="secondary" onClick={() => void cancel()}>Cancel delivery</button> : null}
              <button className="danger" onClick={() => void remove()}>Delete memory</button>
            </div>
          ) : null}
        </article>
      ) : null}
    </Shell>
  );
}
