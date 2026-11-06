"use client";

import { useEffect, useState } from "react";
import { Shell } from "@/components/Shell";
import { ApiError, api } from "@/lib/api";

type Contact = { id: string; displayName: string; email: string; relationship: string | null; roles: string[]; emailVerified: boolean };

export default function ContactsPage() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [form, setForm] = useState({ displayName: "", email: "", relationship: "", roles: ["recipient"] as string[] });
  const [devCode, setDevCode] = useState("");
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<string | null>(null);

  async function load() {
    const data = await api<{ contacts: Contact[] }>("/v1/contacts");
    setContacts(data.contacts);
  }
  useEffect(() => { void load().catch(() => undefined); }, []);

  function toggle(role: string) {
    setForm((current) => ({
      ...current,
      roles: current.roles.includes(role) ? current.roles.filter((value) => value !== role) : [...current.roles, role],
    }));
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    try {
      if (editing) {
        await api(`/v1/contacts/${editing}`, { method: "PATCH", body: JSON.stringify(form) });
      } else {
        await api("/v1/contacts", { method: "POST", body: JSON.stringify(form) });
      }
      setEditing(null);
      setForm({ displayName: "", email: "", relationship: "", roles: ["recipient"] });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save the contact.");
    }
  }

  async function verify(contact: Contact) {
    const sent = await api<{ devCode?: string }>(`/v1/contacts/${contact.id}/verification`, { method: "POST" });
    const code = sent.devCode || window.prompt("Enter the verification code") || "";
    if (!code) return;
    setDevCode(sent.devCode || "");
    await api(`/v1/contacts/${contact.id}/verify`, { method: "POST", body: JSON.stringify({ code }) });
    await load();
  }

  return (
    <Shell>
      <h1>Contacts</h1>
      <p className="muted">Recipients can be chosen per memory. Trusted contacts and verifiers cannot read drafts.</p>
      <form className="card" onSubmit={(event) => void save(event)}>
        <label htmlFor="name">Name</label>
        <input id="name" value={form.displayName} onChange={(event) => setForm({ ...form, displayName: event.target.value })} required />
        <label htmlFor="email">Email</label>
        <input id="email" type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} required />
        <label htmlFor="relationship">Relationship</label>
        <input id="relationship" value={form.relationship} onChange={(event) => setForm({ ...form, relationship: event.target.value })} />
        {["recipient", "trusted_contact", "verifier"].map((role) => (
          <label key={role} className="check"><input type="checkbox" checked={form.roles.includes(role)} onChange={() => toggle(role)} /> {role.replaceAll("_", " ")}</label>
        ))}
        {error ? <p className="error">{error}</p> : null}
        <button type="submit">{editing ? "Save changes" : "Add contact"}</button>
      </form>
      {devCode ? <p className="card">Development verification code: {devCode}</p> : null}
      <div className="list" style={{ marginTop: 16 }}>
        {contacts.map((contact) => (
          <article key={contact.id} className="item">
            <strong>{contact.displayName}</strong>
            <p className="muted">{contact.email} · {contact.roles.join(", ") || "no role"} · {contact.emailVerified ? "email verified" : "email not verified"}</p>
            <div className="row">
              <button className="secondary" onClick={() => { setEditing(contact.id); setForm({ displayName: contact.displayName, email: contact.email, relationship: contact.relationship || "", roles: contact.roles }); }}>Edit</button>
              {!contact.emailVerified ? <button onClick={() => void verify(contact)}>Verify email</button> : null}
              <button className="danger" onClick={() => void api(`/v1/contacts/${contact.id}`, { method: "DELETE" }).then(load)}>Remove</button>
            </div>
          </article>
        ))}
      </div>
    </Shell>
  );
}
