"use client";

import { useEffect, useState } from "react";
import { Shell } from "@/components/Shell";
import { ApiError, api } from "@/lib/api";

type Contact = {
  id: string;
  displayName: string;
  email: string;
  phone: string | null;
  relationship: string | null;
  roles: string[];
  emailVerified: boolean;
};

const emptyForm = { displayName: "", email: "", phone: "", relationship: "", roles: ["recipient"] as string[] };

export default function ContactsPage() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [devCode, setDevCode] = useState("");
  const [error, setError] = useState("");
  const [fields, setFields] = useState<Record<string, string[]>>({});
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

  function fieldMessage(name: string) {
    return fields[name]?.[0] ?? "";
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setFields({});
    try {
      if (editing) {
        await api(`/v1/contacts/${editing}`, { method: "PATCH", body: JSON.stringify(form) });
      } else {
        await api("/v1/contacts", { method: "POST", body: JSON.stringify(form) });
      }
      setEditing(null);
      setForm(emptyForm);
      await load();
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
        setFields(err.details?.fieldErrors ?? {});
      } else {
        setError("Could not save the contact.");
      }
    }
  }

  async function verify(contact: Contact) {
    setError("");
    try {
      const sent = await api<{ devCode?: string }>(`/v1/contacts/${contact.id}/verification`, { method: "POST" });
      const code = sent.devCode || window.prompt("Enter the verification code") || "";
      if (!code) return;
      setDevCode(sent.devCode || "");
      await api(`/v1/contacts/${contact.id}/verify`, { method: "POST", body: JSON.stringify({ code }) });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not verify this email.");
    }
  }

  async function remove(contact: Contact) {
    setError("");
    if (!window.confirm(`Remove ${contact.displayName}?`)) return;
    try {
      await api(`/v1/contacts/${contact.id}`, { method: "DELETE" });
      if (editing === contact.id) {
        setEditing(null);
        setForm(emptyForm);
      }
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not remove this contact.");
    }
  }

  return (
    <Shell>
      <h1>Contacts</h1>
      <p className="muted">Add a name, email, and phone. Recipients can be chosen per memory. Trusted contacts and verifiers cannot read drafts. Saving a contact does not send a memory.</p>
      <form className="card" onSubmit={(event) => void save(event)}>
        <label htmlFor="name">Name</label>
        <input id="name" value={form.displayName} onChange={(event) => setForm({ ...form, displayName: event.target.value })} required />
        {fieldMessage("displayName") ? <p className="error">{fieldMessage("displayName")}</p> : null}
        <label htmlFor="email">Email</label>
        <input id="email" type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} required />
        {fieldMessage("email") ? <p className="error">{fieldMessage("email")}</p> : null}
        <label htmlFor="phone">Phone</label>
        <input id="phone" type="tel" inputMode="tel" autoComplete="tel" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} required placeholder="+92 300 000 0000" />
        {fieldMessage("phone") ? <p className="error">{fieldMessage("phone")}</p> : null}
        <label htmlFor="relationship">Relationship</label>
        <input id="relationship" value={form.relationship} onChange={(event) => setForm({ ...form, relationship: event.target.value })} />
        {["recipient", "trusted_contact", "verifier"].map((role) => (
          <label key={role} className="check"><input type="checkbox" checked={form.roles.includes(role)} onChange={() => toggle(role)} /> {role.replaceAll("_", " ")}</label>
        ))}
        {error ? <p className="error">{error}</p> : null}
        <div className="row">
          <button type="submit">{editing ? "Save changes" : "Add contact"}</button>
          {editing ? <button type="button" className="secondary" onClick={() => { setEditing(null); setForm(emptyForm); setError(""); setFields({}); }}>Cancel</button> : null}
        </div>
      </form>
      {devCode ? <p className="card">Development verification code: {devCode}</p> : null}
      <div className="list" style={{ marginTop: 16 }}>
        {contacts.length === 0 ? <p className="card muted">No contacts yet. Add someone before you schedule a memory.</p> : null}
        {contacts.map((contact) => (
          <article key={contact.id} className="item">
            <strong>{contact.displayName}</strong>
            <p className="muted">{contact.email} · {contact.phone || "no phone"} · {contact.roles.join(", ") || "no role"} · {contact.emailVerified ? "email verified" : "email not verified"}</p>
            <div className="row">
              <button className="secondary" onClick={() => { setEditing(contact.id); setError(""); setFields({}); setForm({ displayName: contact.displayName, email: contact.email, phone: contact.phone || "", relationship: contact.relationship || "", roles: contact.roles.length ? contact.roles : ["recipient"] }); }}>Edit</button>
              {!contact.emailVerified ? <button onClick={() => void verify(contact)}>Verify email</button> : null}
              <button className="danger" onClick={() => void remove(contact)}>Remove</button>
            </div>
          </article>
        ))}
      </div>
    </Shell>
  );
}
