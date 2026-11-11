"use client";

import Link from "next/link";
import { useState } from "react";
import { AuthFrame } from "@/components/AuthFrame";
import { ApiError, api } from "@/lib/api";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setMessage("");
    try {
      const result = await api<{ message: string }>("/v1/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({ email }),
      });
      setMessage(result.message);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not record that request.");
    }
  }

  return (
    <AuthFrame>
      <h1>Reset your password</h1>
      <p className="muted">Enter the email on the account. The same response is shown whether or not that email is registered.</p>
      <form onSubmit={submit}>
        <label htmlFor="email">Email</label>
        <input id="email" type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} required />
        {error ? <p className="error" role="alert">{error}</p> : null}
        {message ? <p className="banner">{message}</p> : null}
        <p><button type="submit">Send reset instructions</button></p>
      </form>
      <p className="muted"><Link href="/login">Back to sign in</Link></p>
    </AuthFrame>
  );
}
