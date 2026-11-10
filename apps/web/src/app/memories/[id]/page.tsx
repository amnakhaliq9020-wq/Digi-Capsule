"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Shell, useTimeZone } from "@/components/Shell";
import { ApiError, api } from "@/lib/api";
import { deliveryModeLabel, formatWhen, memoryStatusLabel } from "@/lib/time";

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
  return <Shell><MemoryDetail /></Shell>;
}

function MemoryDetail() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [memory, setMemory] = useState<Memory | null>(null);
  const [error, setError] = useState("");
  const timeZone = useTimeZone();

  function showError(err: unknown, fallback: string) {
    setError(err instanceof ApiError ? err.message : fallback);
  }

  useEffect(() => {
    api<{ memory: Memory }>(`/v1/memories/${params.id}`).then((data) => setMemory(data.memory)).catch((err) => setError(err instanceof ApiError ? err.message : "Not found."));
  }, [params.id]);

  async function cancel() {
    setError("");
    try {
      await api(`/v1/memories/${params.id}/cancel`, { method: "POST" });
      router.refresh();
      const data = await api<{ memory: Memory }>(`/v1/memories/${params.id}`);
      setMemory(data.memory);
    } catch (err) {
      showError(err, "Could not cancel this delivery.");
    }
  }

  async function remove() {
    if (!window.confirm("Delete this memory? This removes the letter and its files. A memory that was already delivered cannot be deleted.")) return;
    setError("");
    try {
      await api(`/v1/memories/${params.id}`, { method: "DELETE" });
      router.push("/memories");
    } catch (err) {
      showError(err, "Could not delete this memory.");
    }
  }

  return (
    <>
      {error ? <p className="error" role="alert">{error}</p> : null}
      {!memory && !error ? <p className="loading">Loading…</p> : null}
      {memory ? (
        <article className="stack">
          <div className="title-row"><h1>{memory.title}</h1><span className="pill">{memoryStatusLabel(memory.status)}</span><span className="pill">{deliveryModeLabel(memory.deliveryMode)}</span></div>
          <div className="card stack">
            <p className="preserve">{memory.body || "This memory has no letter."}</p>
            <p className="muted">Recipients: {memory.recipients.map((person) => `${person.displayName} (${person.email})`).join(", ") || "None yet"}</p>
            {memory.schedule?.nextRunAt ? <p className="muted">Sends {formatWhen(memory.schedule.nextRunAt, timeZone)} ({memory.schedule.timeZone}).{memory.delivery.sent > 0 ? "" : " This is saved and has not been sent."}</p> : null}
            <p className="muted">Delivery status: {memory.delivery.sent > 0 ? `${memory.delivery.sent} sent` : memoryStatusLabel(memory.status)}</p>
            {memory.attachments.length === 0 ? <p className="empty">No photo or video is attached.</p> : (
              <div className="media-grid">
                {memory.attachments.map((file) => (
                  <figure key={file.id}>
                    {file.kind === "video"
                      ? <video src={`/v1/media/${file.id}/content`} controls />
                      : <img src={`/v1/media/${file.id}/content`} alt={file.originalName} />}
                    <a href={`/v1/media/${file.id}/content`} download={file.originalName}>Download {file.originalName}</a>
                  </figure>
                ))}
              </div>
            )}
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
    </>
  );
}
