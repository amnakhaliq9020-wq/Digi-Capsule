"use client";

import { useEffect, useState } from "react";
import { ApiError, api } from "@/lib/api";
import { formatWhen } from "@/lib/time";

type Share = {
  id: string;
  status: "active" | "expired" | "revoked";
  expiresAt: string;
  recipientTimeZone: string;
  recipient: { id: string; displayName: string };
  file: { id: string; originalName: string };
};

type Created = Share & { url?: string };

export function MediaShares({
  memoryId,
  files,
  recipients,
}: {
  memoryId: string;
  files: { id: string; originalName: string }[];
  recipients: { id: string; displayName: string }[];
}) {
  const [shares, setShares] = useState<Share[]>([]);
  const [fileId, setFileId] = useState(files[0]?.id || "");
  const [recipientId, setRecipientId] = useState(recipients[0]?.id || "");
  const [hours, setHours] = useState("24");
  const [freshUrl, setFreshUrl] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  function load() {
    return api<{ shares: Share[] }>(`/v1/memories/${memoryId}/shares`)
      .then((data) => setShares(data.shares))
      .catch((err) => setError(err instanceof ApiError ? err.message : "Could not load links."));
  }

  useEffect(() => {
    void load();
  }, [memoryId]);

  async function createLink() {
    setError("");
    setMessage("");
    setFreshUrl("");
    try {
      const result = await api<{ share: Created }>(`/v1/memories/${memoryId}/media/${fileId}/shares`, {
        method: "POST",
        body: JSON.stringify({ recipientId, expiresInHours: Number(hours) }),
      });
      setFreshUrl(result.share.url || "");
      setMessage("Private link created. Copy it now. It is shown only this once.");
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create a link.");
    }
  }

  async function revoke(id: string) {
    if (!window.confirm("Revoke this link now? The recipient will not be able to open it.")) return;
    setError("");
    setMessage("");
    try {
      await api(`/v1/media/shares/${id}/revoke`, { method: "POST" });
      setMessage("Link revoked.");
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not revoke this link.");
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(freshUrl);
      setMessage("Link copied.");
    } catch {
      setMessage("Select the link and copy it.");
    }
  }

  return (
    <section className="card stack">
      <h2>Temporary file links</h2>
      <p className="muted">A link opens one file for one signed-in recipient. The default lifetime is 24 hours. A forwarded link does not work for anyone else.</p>
      {error ? <p className="error" role="alert">{error}</p> : null}
      {message ? <p className="ok" role="status">{message}</p> : null}
      <label htmlFor="share-file">File</label>
      <select id="share-file" value={fileId} onChange={(event) => setFileId(event.target.value)}>
        {files.map((file) => <option key={file.id} value={file.id}>{file.originalName}</option>)}
      </select>
      <label htmlFor="share-recipient">Recipient</label>
      <select id="share-recipient" value={recipientId} onChange={(event) => setRecipientId(event.target.value)}>
        {recipients.map((person) => <option key={person.id} value={person.id}>{person.displayName}</option>)}
      </select>
      <label htmlFor="share-hours">Link expiration</label>
      <select id="share-hours" value={hours} onChange={(event) => setHours(event.target.value)}>
        <option value="1">1 hour</option>
        <option value="24">24 hours</option>
        <option value="72">3 days</option>
        <option value="168">7 days</option>
      </select>
      <button type="button" onClick={() => void createLink()}>Generate temporary link</button>
      {freshUrl ? (
        <div className="stack">
          <label htmlFor="share-url">Copy link</label>
          <input id="share-url" readOnly value={freshUrl} />
          <button type="button" className="secondary" onClick={() => void copy()}>Copy link</button>
        </div>
      ) : null}
      {shares.length === 0 ? <p className="empty">No temporary links yet.</p> : shares.map((share) => (
        <article key={share.id} className="stack">
          <p className="muted">Intended recipient: {share.recipient.displayName}</p>
          <p className="muted">File: {share.file.originalName}</p>
          <p className="muted">Status: {share.status === "active" ? "Active" : share.status === "expired" ? "Expired" : "Revoked"}</p>
          <p className="muted">Expires: {formatWhen(share.expiresAt, share.recipientTimeZone)} ({share.recipientTimeZone})</p>
          {share.status === "active" ? <button type="button" className="secondary" onClick={() => void revoke(share.id)}>Revoke link</button> : null}
        </article>
      ))}
    </section>
  );
}
