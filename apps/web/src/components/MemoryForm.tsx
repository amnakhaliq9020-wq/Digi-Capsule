"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FormAlert } from "@/components/FormAlert";
import { ApiError, api } from "@/lib/api";
import { describeLocalChoice, formatWhen, zonesWith } from "@/lib/time";
import { UPLOAD_HELP, explainChosenFile, explainUploadFailure } from "@/lib/upload";

type Contact = { id: string; displayName: string; email: string; emailVerified: boolean; roles: string[]; timeZone: string | null };
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
  const [deliveryStatus, setDeliveryStatus] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [uploadError, setUploadError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [serverTime, setServerTime] = useState("");
  const fileInput = useRef<HTMLInputElement | null>(null);
  const saveLock = useRef<Promise<string> | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      api<{ user: { timeZone: string } }>("/v1/auth/me"),
      api<{ contacts: Contact[] }>("/v1/contacts"),
      api<{ serverTime: string }>("/v1/health"),
      memoryId ? api<{ memory: Memory }>(`/v1/memories/${memoryId}`) : Promise.resolve(null),
    ]).then(([profile, contactData, clock, data]) => {
      if (cancelled) return;
      setContacts(contactData.contacts);
      setServerTime(clock.serverTime);
      setTimeZone(data?.memory.schedule?.timeZone || profile.user.timeZone);
      if (!data) return;
      setDeliveryStatus(data.memory.status);
      setTitle(data.memory.title);
      setBody(data.memory.body);
      setAttachments(data.memory.attachments);
      setSelected(data.memory.recipients.map((person) => person.id));
      if (data.memory.deliveryMode === "if_i_am_gone") setMode("if_i_am_gone");
      if (data.memory.schedule?.localDate) setLocalDate(data.memory.schedule.localDate);
      if (data.memory.schedule?.localTime) setLocalTime(data.memory.schedule.localTime);
    }).catch((err) => {
      if (!cancelled) setError(err instanceof ApiError ? err.message : "Could not load this memory.");
    });
    return () => {
      cancelled = true;
    };
  }, [memoryId]);

  function saveDraft() {
    if (saveLock.current) return saveLock.current;
    setError("");
    const payload = { title, body };
    const pending = (id
      ? api<{ memory: Memory }>(`/v1/memories/${id}`, { method: "PATCH", body: JSON.stringify(payload) })
      : api<{ memory: Memory }>("/v1/memories", { method: "POST", body: JSON.stringify(payload) }))
      .then((saved) => {
        setId(saved.memory.id);
        setMessage("Draft saved. It is still private.");
        if (!memoryId) router.replace(`/memories/${saved.memory.id}/edit`);
        return saved.memory.id;
      })
      .finally(() => {
        saveLock.current = null;
      });
    saveLock.current = pending;
    return pending;
  }

  async function upload(file: File) {
    setError("");
    setUploadError("");
    const localProblem = explainChosenFile(file);
    if (localProblem) {
      setUploadError(localProblem);
      if (fileInput.current) fileInput.current.value = "";
      return;
    }
    setUploading(true);
    try {
      const memory = id || await saveDraft();
      const data = new FormData();
      data.set("file", file);
      const result = await api<{ attachment: Attachment }>(`/v1/memories/${memory}/attachments`, { method: "POST", body: data });
      setAttachments((current) => [...current, result.attachment]);
      setMessage(`Uploaded ${file.name}. It stays private with this draft.`);
    } catch (err) {
      setUploadError(explainUploadFailure(err, err instanceof ApiError ? err.message : "The upload did not finish. Check your connection and try again."));
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  async function removeAttachment(assetId: string) {
    if (!id) return;
    setError("");
    try {
      await api(`/v1/memories/${id}/attachments/${assetId}`, { method: "DELETE" });
      setAttachments((current) => current.filter((item) => item.id !== assetId));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not remove that file.");
    }
  }

  async function schedule() {
    if (deliveryStatus === "scheduled") {
      const confirmed = window.confirm("Change this scheduled delivery? The previous date and unsent jobs will be replaced. A message the email provider already accepted cannot be recalled.");
      if (!confirmed) return;
    }
    setError("");
    try {
      const memory = await saveDraft();
      const saved = await api<{ message?: string }>(`/v1/memories/${memory}/schedule`, {
        method: "POST",
        body: JSON.stringify({ mode, localDate, localTime, timeZone, recipientIds: selected }),
      });
      router.push(`/memories/${memory}?notice=${encodeURIComponent(saved.message || "Delivery updated.")}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save the schedule.");
    }
  }

  const chosen = contacts.filter((contact) => selected.includes(contact.id));

  return (
    <div className="stack">
      <ol className="steps">
        <li>1. Write the memory</li>
        <li>2. Add a photo or video</li>
        <li>3. Choose people and a date</li>
      </ol>
      <p className="muted">Save the draft first. It stays private. Then choose who may receive it and when. Nothing is sent by pressing Save draft.</p>
    <div className="split">
      <form className="card stack" onSubmit={(event) => { event.preventDefault(); void saveDraft().catch((err) => setError(err instanceof ApiError ? err.message : "Could not save.")); }}>
        <div>
          <label htmlFor="title">Title</label>
          <p id="title-help" className="muted">A short name you will recognize. Recipients do not see it until the memory is released.</p>
          <input id="title" aria-describedby="title-help" value={title} onChange={(event) => setTitle(event.target.value)} required />
          <label htmlFor="letter">Letter</label>
          <p id="letter-help" className="muted">Write what you want them to read. You can leave this blank and add a photo or video instead.</p>
          <textarea id="letter" aria-describedby="letter-help" value={body} onChange={(event) => setBody(event.target.value)} />
        </div>
        <div className="row">
          <button type="submit">Save draft</button>
          <span className="ok">{message}</span>
        </div>
        {id ? (
          <div>
            <label htmlFor="file">Photo or video</label>
            <p id="file-help" className="muted">{UPLOAD_HELP}</p>
            <input
              id="file"
              ref={fileInput}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime"
              aria-describedby={uploadError ? "file-help file-error" : "file-help"}
              aria-invalid={uploadError ? true : undefined}
              disabled={uploading}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void upload(file);
              }}
            />
            {uploading ? <p className="muted" aria-live="polite">Uploading… If this fails, the reason will appear below.</p> : null}
            {uploadError ? <FormAlert><span id="file-error">{uploadError}</span></FormAlert> : null}
            <div className="media-grid">
              {attachments.map((file) => (
                <figure key={file.id}>
                  {file.kind === "video" ? <video src={`/v1/media/${file.id}/content`} controls /> : <img src={`/v1/media/${file.id}/content`} alt={file.originalName} />}
                  <button type="button" className="secondary" onClick={() => void removeAttachment(file.id)}>Remove</button>
                </figure>
              ))}
            </div>
          </div>
        ) : <p className="empty">Save the draft before attaching a file.</p>}
        {error ? <FormAlert>{error}</FormAlert> : null}
      </form>
      <aside className="card stack" id="delivery">
        <h2>Who receives this</h2>
        <p className="muted">Only people marked as recipients are listed here. A trusted contact cannot read this draft.</p>
        {contacts.filter((contact) => contact.roles.includes("recipient")).map((contact) => (
          <label key={contact.id} className="check">
            <input type="checkbox" checked={selected.includes(contact.id)} onChange={() => setSelected((current) => current.includes(contact.id) ? current.filter((value) => value !== contact.id) : [...current, contact.id])} />
            <span>{contact.displayName} · {contact.email} {contact.timeZone ? `· ${contact.timeZone}` : "· no time zone saved"} {contact.emailVerified ? "" : "(email not verified)"}</span>
          </label>
        ))}
        {contacts.length === 0 ? <p className="muted">Add a contact first.</p> : null}
        <h2>Delivery</h2>
        <label className="check"><input type="radio" name="mode" checked={mode === "on_date"} onChange={() => setMode("on_date")} /> Send on a date</label>
        <label className="check"><input type="radio" name="mode" checked={mode === "if_i_am_gone"} onChange={() => setMode("if_i_am_gone")} /> If I am gone</label>
        {mode === "on_date" ? (
          <>
            <div className="callout">
              <p>Server time: {serverTime ? formatWhen(serverTime, timeZone) : "Loading…" } ({timeZone}). A delivery has to be later than this. The date is each recipient&apos;s calendar day. The time, 9:00 am unless you change it, is read in that recipient&apos;s time zone. The time zone below is used only when a recipient has not chosen one.</p>
            </div>
            <p className="banner">{describeLocalChoice(localDate, localTime, timeZone)}</p>
            <label htmlFor="date">Date</label>
            <input id="date" type="date" value={localDate} onChange={(event) => setLocalDate(event.target.value)} />
            <label htmlFor="time">Time</label>
            <p id="time-help" className="muted">The clock uses am and pm. The sentence above repeats the time so the numbers are not the only form.</p>
            <input id="time" type="time" aria-describedby="time-help" value={localTime} onChange={(event) => setLocalTime(event.target.value)} />
            <label htmlFor="zone">Time zone when a recipient has not chosen one</label>
            <select id="zone" value={timeZone} onChange={(event) => setTimeZone(event.target.value)}>{zonesWith(timeZone).map((zone) => <option key={zone}>{zone}</option>)}</select>
          </>
        ) : <p className="muted">Warnings stay separate from this memory. The test console can deliver it after the final warning plus 7 days. Production does not.</p>}
        <div className="card preview">
          <strong>Preview</strong>
          <p className="muted">
            {mode === "on_date"
              ? `${describeLocalChoice(localDate, localTime, chosen.find((person) => person.timeZone)?.timeZone || timeZone)} ${chosen.map((person) => `${person.displayName} (${person.timeZone || timeZone})`).join(", ") || "The selected people"} receive this on that calendar day. A recipient who has saved a time zone uses theirs.`
              : `${chosen.map((person) => person.displayName).join(", ") || "The selected people"} receive this memory only after the test-console missed-check-in sequence. Warnings never include the letter.`}
          </p>
        </div>
        <button type="button" onClick={() => void schedule()}>Save delivery</button>
      </aside>
    </div>
    </div>
  );
}
