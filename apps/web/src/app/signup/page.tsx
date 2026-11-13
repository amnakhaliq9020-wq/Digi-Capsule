"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AuthFrame } from "@/components/AuthFrame";
import { FormAlert } from "@/components/FormAlert";
import { ApiError, api } from "@/lib/api";
import { zonesWith } from "@/lib/time";

export default function SignupPage() {
  const router = useRouter();
  const [form, setForm] = useState({ displayName: "", email: "", password: "", timeZone: "Asia/Karachi" });
  const [error, setError] = useState("");
  const [fields, setFields] = useState<Record<string, string[]>>({});

  useEffect(() => {
    const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const email = new URLSearchParams(window.location.search).get("email");
    setForm((current) => ({ ...current, timeZone: detected || current.timeZone, email: email || current.email }));
  }, []);

  function set(key: string, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function fieldMessage(name: string) {
    return fields[name]?.[0] ?? "";
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setFields({});
    try {
      const result = await api<{ devVerificationToken?: string }>("/v1/auth/register", { method: "POST", body: JSON.stringify(form) });
      if (result.devVerificationToken) sessionStorage.setItem("devVerificationToken", result.devVerificationToken);
      router.push("/verify-email");
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
        setFields(err.details?.fieldErrors ?? {});
      } else {
        setError("Could not create the account.");
      }
    }
  }

  return (
    <AuthFrame>
      <h1>Create your account</h1>
      <p className="muted">Use an email you can open. This account is only for you.</p>
      <form onSubmit={submit} noValidate>
        <label htmlFor="name">Your name</label>
        <input id="name" autoComplete="name" value={form.displayName} onChange={(event) => set("displayName", event.target.value)} required aria-invalid={fieldMessage("displayName") ? true : undefined} aria-describedby={fieldMessage("displayName") ? "name-error" : undefined} />
        {fieldMessage("displayName") ? <FormAlert><span id="name-error">{fieldMessage("displayName")}</span></FormAlert> : null}
        <label htmlFor="email">Email</label>
        <input id="email" type="email" autoComplete="email" value={form.email} onChange={(event) => set("email", event.target.value)} required aria-invalid={fieldMessage("email") ? true : undefined} aria-describedby={fieldMessage("email") ? "email-error" : undefined} />
        {fieldMessage("email") ? <FormAlert><span id="email-error">{fieldMessage("email")}</span></FormAlert> : null}
        <label htmlFor="password">Password</label>
        <input id="password" type="password" autoComplete="new-password" aria-describedby={fieldMessage("password") ? "password-help password-error" : "password-help"} aria-invalid={fieldMessage("password") ? true : undefined} value={form.password} onChange={(event) => set("password", event.target.value)} required />
        <p id="password-help" className="muted">At least 10 characters, with a letter and a number.</p>
        {fieldMessage("password") ? <FormAlert><span id="password-error">{fieldMessage("password")}</span></FormAlert> : null}
        <label htmlFor="zone">Time zone</label>
        <p id="zone-help" className="muted">Detected from this device. You can change it now or later in Settings.</p>
        <select id="zone" aria-describedby={fieldMessage("timeZone") ? "zone-help zone-error" : "zone-help"} aria-invalid={fieldMessage("timeZone") ? true : undefined} value={form.timeZone} onChange={(event) => set("timeZone", event.target.value)}>
          {zonesWith(form.timeZone).map((zone) => <option key={zone}>{zone}</option>)}
        </select>
        {fieldMessage("timeZone") ? <FormAlert><span id="zone-error">{fieldMessage("timeZone")}</span></FormAlert> : null}
        {error && !fieldMessage("displayName") && !fieldMessage("email") && !fieldMessage("password") && !fieldMessage("timeZone") ? <FormAlert>{error}</FormAlert> : null}
        <p><button type="submit">Create account</button></p>
      </form>
      <p className="muted">Already registered? <Link href="/login">Sign in</Link></p>
    </AuthFrame>
  );
}
