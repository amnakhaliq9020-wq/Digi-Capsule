"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ApiError, api } from "@/lib/api";

type Contact = { id: string; displayName: string; email: string; emailVerified: boolean; roles: string[] };
type Attachment = { id: string; mimeType: string; originalName: string; kind: "photo" | "video" };
type Memory = {
  id: string;
  title: string;
  body: string;
  status: string;
  deliveryMode: string;
  recipients: { id: string }[];
  attachments: Attachment[];
  schedule: { localDate: string | null; localTime: string | null; timeZone: string } | null;
};

const zones = ["UTC", "America/New_York", "America/Los_Angeles", "Europe/London", "Asia/Karachi", "Asia/Dubai", "Australia/Sydney"];

export function MemoryForm({ memoryId }: { memoryId?: string }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [mode, setMode] = useState<"on_date" | "if_i_am_gone">("on_date");
  const [localDate, setLocalDate] = useState("");
  const [localTime, setLocalTime] = useState("09:00");
  const [timeZone, setTimeZone] = useState("UTC");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [id, setId] = useState(memoryId);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    api<{ contacts: Contact[] }>("/v1/contacts").then((data) => setContacts(data.contacts)).catch(() => undefined);
    api<{ user: { timeZone: string } }>("/v1/auth/me").then((data) => setTimeZone(data.user.timeZone)).catch(() => undefined);
    if (!memoryId) return;
    api<{ memory: Memory }>(`/v1/memories/${memoryId}`).then((data) => {
      setTitle(data.memory.title);
      setBody(data.memory.body);
      setAttachments(data.memory.attachments);
      setSelected(data.memory.recipients.map((person) => person.id));
      if (data.memory.deliveryMode === "if_i_am_gone") setMode("if_i_am_gone");
      if (data.memory.schedule?.localDate) setLocalDate(data.memory.schedule.localDate);
      if (data.memory.schedule?.localTime) setLocalTime(data.memory.schedule.localTime);
      if (data.memory.schedule?.timeZone) setTimeZone(data.memory.schedule.timeZone);
    }).catch((err) => setError(err instanceof ApiError ? err.message : "Could not load this memory."));
  }, [memoryId]);

  async function saveDraft() {
    setError("");
    const payload = { title, body };
    const saved = id
      ? await api<{ memory: Memory }>(`/v1/memories/${id}`, { method: "PATCH", body: JSON.stringify(payload) })
      : await api<{ memory: Memory }>("/v1/memories", { method: "POST", body: JSON.stringify(payload) });
    setId(saved.memory.id);
    setMessage("Draft saved. It is still private.");
    if (!memoryId) router.replace(`/memories/${saved.memory.id}/edit`);
    return saved.memory.id;
  }

  async function upload(file: File) {
    setError("");
    const memory = id || await saveDraft();
    const data = new FormData();
    data.set("file", file);
    const result = await api<{ attachment: Attachment }>(`/v1/memories/${memory}/attachments`, { method: "POST", body: data });
    setAttachments((current) => [...current, result.attachment]);
  }

  async function removeAttachment(assetId: string) {
    if (!id) return;
    await api(`/v1/memories/${id}/attachments/${assetId}`, { method: "DELETE" });
    setAttachments((current) => current.filter((item) => item.id !== assetId));
  }

  async function schedule() {
    setError("");
    try {
      const memory = id || await saveDraft();
      await api(`/v1/memories/${memory}/schedule`, {
        method: "POST",
        body: JSON.stringify({ mode, localDate, localTime, timeZone, recipientIds: selected }),
      });
      router.push(`/memories/${memory}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save the schedule.");
    }
  }

  const chosen = contacts.filter((contact) => selected.includes(contact.id));

  return (
    <div className="split">
      <form className="card stack" onSubmit={(event) => { event.preventDefault(); void saveDraft().catch((err) => setError(err instanceof ApiError ? err.message : "Could not save.")); }}>
        <div>
          <label htmlFor="title">Title</label>
          <input id="title" value={title} onChange={(event) => setTitle(event.target.value)} required />
          <label htmlFor="letter">Letter</label>
          <textarea id="letter" value={body} onChange={(event) => setBody(event.target.value)} placeholder="Write what you want them to read." />
        </div>
        <div className="row">
          <button type="submit">Save draft</button>
          <span className="muted">{message}</span>
        </div>
        {id ? (
          <div>
            <label htmlFor="file">Photo or video</label>
            <input id="file" type="file" accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime" onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file).catch((err) => setError(err instanceof ApiError ? err.message : "Upload failed.")); }} />
            <div className="media-grid" style={{ marginTop: 12 }}>
              {attachments.map((file) => (
                <figure key={file.id}>
                  {file.kind === "video" ? <video src={`/v1/media/${file.id}/content`} controls /> : <img src={`/v1/media/${file.id}/content`} alt={file.originalName} />}
                  <button type="button" className="secondary" onClick={() => void removeAttachment(file.id)}>Remove</button>
                </figure>
              ))}
            </div>
          </div>
        ) : <p className="muted">Save the draft before attaching a file.</p>}
        {error ? <p className="error">{error}</p> : null}
      </form>
      <aside className="card stack">
        <h2>Who receives this</h2>
        {contacts.filter((contact) => contact.roles.includes("recipient")).map((contact) => (
          <label key={contact.id} className="check">
            <input type="checkbox" checked={selected.includes(contact.id)} onChange={() => setSelected((current) => current.includes(contact.id) ? current.filter((value) => value !== contact.id) : [...current, contact.id])} />
            <span>{contact.displayName} · {contact.email} {contact.emailVerified ? "" : "(email not verified)"}</span>
          </label>
        ))}
        {contacts.length === 0 ? <p className="muted">Add a contact first.</p> : null}
        <h2>Delivery</h2>
        <label className="check"><input type="radio" name="mode" checked={mode === "on_date"} onChange={() => setMode("on_date")} /> Send on a date</label>
        <label className="check"><input type="radio" name="mode" checked={mode === "if_i_am_gone"} onChange={() => setMode("if_i_am_gone")} /> If I am gone</label>
        {mode === "on_date" ? (
          <>
            <label htmlFor="date">Date</label>
            <input id="date" type="date" value={localDate} onChange={(event) => setLocalDate(event.target.value)} />
            <label htmlFor="time">Time</label>
            <input id="time" type="time" value={localTime} onChange={(event) => setLocalTime(event.target.value)} />
            <label htmlFor="zone">Time zone</label>
            <select id="zone" value={timeZone} onChange={(event) => setTimeZone(event.target.value)}>{zones.map((zone) => <option key={zone}>{zone}</option>)}</select>
          </>
        ) : <p className="muted">This uses the separate check-in review. Missing a check-in does not send it. Real release stays off outside the test console.</p>}
        <div className="card" style={{ boxShadow: "none" }}>
          <strong>Preview</strong>
          <p className="muted">
            {mode === "on_date"
              ? `On ${localDate || "the chosen date"} at ${localTime} (${timeZone}), ${chosen.map((person) => person.displayName).join(", ") || "the selected people"} will get a notice that this memory is ready. The email will not include the letter.`
              : `${chosen.map((person) => person.displayName).join(", ") || "The selected people"} are named on the If I am gone option. Warnings never send this memory.`}
          </p>
        </div>
        <button type="button" onClick={() => void schedule()}>Save delivery</button>
      </aside>
    </div>
  );
}
