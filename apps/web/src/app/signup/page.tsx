"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ApiError, api } from "@/lib/api";

const zones = ["UTC", "America/New_York", "America/Los_Angeles", "Europe/London", "Asia/Karachi", "Asia/Dubai", "Australia/Sydney"];

export default function SignupPage() {
  const router = useRouter();
  const [form, setForm] = useState({ displayName: "", email: "", password: "", timeZone: "Asia/Karachi" });
  const [error, setError] = useState("");

  function set(key: string, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    try {
      const result = await api<{ devVerificationToken?: string }>("/v1/auth/register", { method: "POST", body: JSON.stringify(form) });
      if (result.devVerificationToken) sessionStorage.setItem("devVerificationToken", result.devVerificationToken);
      router.push("/verify-email");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create the account.");
    }
  }

  return (
    <main className="hero card">
      <h1>Create your account</h1>
      <p className="muted">Use an email you can open. This account is only for you.</p>
      <form onSubmit={submit}>
        <label htmlFor="name">Your name</label>
        <input id="name" value={form.displayName} onChange={(event) => set("displayName", event.target.value)} required />
        <label htmlFor="email">Email</label>
        <input id="email" type="email" value={form.email} onChange={(event) => set("email", event.target.value)} required />
        <label htmlFor="password">Password</label>
        <input id="password" type="password" value={form.password} onChange={(event) => set("password", event.target.value)} required />
        <p className="muted">At least 10 characters, with a letter and a number.</p>
        <label htmlFor="zone">Time zone</label>
        <select id="zone" value={form.timeZone} onChange={(event) => set("timeZone", event.target.value)}>
          {zones.map((zone) => <option key={zone}>{zone}</option>)}
        </select>
        {error ? <p className="error">{error}</p> : null}
        <p><button type="submit">Create account</button></p>
      </form>
      <p className="muted">Already registered? <Link href="/login">Sign in</Link></p>
    </main>
  );
}
