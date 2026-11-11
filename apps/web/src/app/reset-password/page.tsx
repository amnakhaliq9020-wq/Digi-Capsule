"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AuthFrame } from "@/components/AuthFrame";
import { ApiError, api } from "@/lib/api";

export default function ResetPasswordPage() {
  const [token, setToken] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    const fromLink = new URLSearchParams(window.location.search).get("token");
    if (fromLink) setToken(fromLink);
  }, []);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    try {
      await api("/v1/auth/reset-password", { method: "POST", body: JSON.stringify({ token, password }) });
      setDone(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not reset the password.");
    }
  }

  return (
    <AuthFrame>
      <h1>Choose a new password</h1>
      <p className="muted">Use the link from the reset message. It works once, then it expires. This signs out other sessions on the account.</p>
      {done ? (
        <p className="banner">Password saved. <Link href="/login">Sign in</Link></p>
      ) : (
        <form onSubmit={submit}>
          <label htmlFor="token">Reset code</label>
          <input id="token" value={token} onChange={(event) => setToken(event.target.value)} required autoComplete="off" />
          <label htmlFor="password">New password</label>
          <input id="password" type="password" autoComplete="new-password" aria-describedby="password-help" value={password} onChange={(event) => setPassword(event.target.value)} required />
          <p id="password-help" className="muted">At least 10 characters, with a letter and a number.</p>
          {error ? <p className="error" role="alert">{error}</p> : null}
          <p><button type="submit">Save password</button></p>
        </form>
      )}
    </AuthFrame>
  );
}
