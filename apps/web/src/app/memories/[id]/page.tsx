"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { MediaShares } from "@/components/MediaShares";
import { Shell } from "@/components/Shell";
import { Status, statusKindFor } from "@/components/Status";
import { ApiError, api } from "@/lib/api";
import { civilDateLabel, civilTimeLabel, deliveryModeLabel, memoryStatusLabel } from "@/lib/time";

type Memory = {
  id: string;
  title: string;
  body: string;
  status: string;
  deliveryMode: string;
  recipients: { id: string; displayName: string; email: string }[];
  attachments: { id: string; kind: "photo" | "video"; originalName: string }[];
  scheduleGeneration?: number;
  schedule: { localDate: string | null; localTime: string | null; timeZone: string; nextRunAt: string | null; status?: string; generation?: number } | null;
  recipientDeliveries?: {
    id: string;
    displayName: string;
    email: string | null;
    timeZone: string;
    localDate: string | null;
    localTime: string | null;
    deliveryStatus: string;
  }[];
  delivery: { sent: number; failed: boolean; pending: boolean };
  access?: "owner" | "recipient";
};

export default function MemoryDetailPage() {
  return <Shell><MemoryDetail /></Shell>;
}

function MemoryDetail() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [memory, setMemory] = useState<Memory | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  function showError(err: unknown, fallback: string) {
    setError(err instanceof ApiError ? err.message : fallback);
  }

  useEffect(() => {
    const text = new URLSearchParams(window.location.search).get("notice");
    if (text) setNotice(text);
    api<{ memory: Memory }>(`/v1/memories/${params.id}`).then((data) => setMemory(data.memory)).catch((err) => setError(err instanceof ApiError ? err.message : "Not found."));
  }, [params.id]);

  async function cancel() {
    if (!window.confirm("Cancel this scheduled delivery? The memory stays in your capsule. A message the email provider already accepted cannot be recalled.")) return;
    setError("");
    setNotice("");
    try {
      const result = await api<{ memory: Memory; message?: string }>(`/v1/memories/${params.id}/cancel`, { method: "POST" });
      setMemory(result.memory);
      setNotice(result.message || "Delivery cancelled. The memory is still in your capsule.");
      router.refresh();
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
      {notice ? <p className="ok" role="status">{notice}</p> : null}
      {!memory && !error ? <p className="loading">Loading…</p> : null}
      {memory ? (
        <article className="stack">
          <div className="title-row"><h1>{memory.title}</h1><Status kind={statusKindFor(memory.status)}>{memoryStatusLabel(memory.status)}</Status><span className="pill">{deliveryModeLabel(memory.deliveryMode)}</span></div>
          <div className="card stack">
            <p className="preserve">{memory.body || "This memory has no letter."}</p>
            {memory.access === "recipient" ? <p className="muted">This is the released copy shared with you.</p> : (
              <p className="muted">Recipients: {memory.recipients.map((person) => `${person.displayName} (${person.email})`).join(", ") || "None yet"}</p>
            )}
            {memory.recipientDeliveries && memory.recipientDeliveries.length > 0 ? memory.recipientDeliveries.map((row) => (
              <div key={row.id} className="stack">
                <p className="muted">Scheduled date: {row.localDate ? civilDateLabel(row.localDate) : "Not set"}</p>
                <p className="muted">Scheduled local time: {row.localTime ? civilTimeLabel(row.localTime) : "9:00 am"}</p>
                <p className="muted">Recipient time zone: {row.displayName} · {row.timeZone}</p>
                <p className="muted">Schedule status: {memory.schedule?.status || memory.status}</p>
                <p className="muted">Delivery status: <Status kind={row.deliveryStatus === "sent" ? "delivered" : row.deliveryStatus === "uncertain" ? "warning" : statusKindFor(row.deliveryStatus)}>{row.deliveryStatus === "sent" ? "Delivered" : row.deliveryStatus === "uncertain" ? "Unconfirmed" : row.deliveryStatus === "failed" ? "Error" : "Pending"}</Status></p>
                {row.deliveryStatus === "sent" || row.deliveryStatus === "uncertain" ? <p className="muted">A message the email provider already accepted cannot be recalled.</p> : null}
              </div>
            )) : memory.schedule?.localDate ? (
              <div className="stack">
                <p className="muted">Scheduled date: {civilDateLabel(memory.schedule.localDate)}</p>
                <p className="muted">Scheduled local time: {memory.schedule.localTime ? civilTimeLabel(memory.schedule.localTime) : "9:00 am"}</p>
                <p className="muted">Recipient time zone: {memory.schedule.timeZone}</p>
                <p className="muted">Delivery status: <Status kind={statusKindFor(memory.status)}>{memoryStatusLabel(memory.status)}</Status></p>
              </div>
            ) : null}
            <p className="muted">Delivery status: {memory.delivery.sent > 0 ? `${memory.delivery.sent} sent` : memoryStatusLabel(memory.status)}</p>
            {memory.access !== "recipient" && memory.attachments.length > 0 && memory.recipients.length > 0 ? (
              <MediaShares memoryId={memory.id} files={memory.attachments} recipients={memory.recipients} />
            ) : null}
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
          {memory.access !== "recipient" && memory.status !== "released" ? (
            <div className="row">
              <Link className="button" href={`/memories/${memory.id}/edit`}>Edit</Link>
              {memory.status === "scheduled" ? <Link className="button secondary" href={`/memories/${memory.id}/edit#delivery`}>Edit delivery</Link> : null}
              {memory.status === "scheduled" ? <button className="secondary" onClick={() => void cancel()}>Cancel delivery</button> : null}
              <button className="danger" onClick={() => void remove()}>Delete memory</button>
            </div>
          ) : null}
        </article>
      ) : null}
    </>
  );
}
