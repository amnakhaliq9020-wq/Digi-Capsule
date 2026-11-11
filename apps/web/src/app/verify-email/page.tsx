"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AuthFrame } from "@/components/AuthFrame";
import { ApiError, api } from "@/lib/api";

export default function VerifyEmailPage() {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    const fromLink = new URLSearchParams(window.location.search).get("token");
    const saved = sessionStorage.getItem("devVerificationToken");
    if (fromLink) setToken(fromLink);
    else if (saved) setToken(saved);
  }, []);

  async function resend() {
    setError("");
    setNotice("");
    try {
      const result = await api<{ devVerificationToken?: string; emailVerified?: boolean }>("/v1/auth/verify-email/resend", { method: "POST" });
      if (result.emailVerified) {
        setNotice("This email is already confirmed.");
        return;
      }
      if (result.devVerificationToken) {
        sessionStorage.setItem("devVerificationToken", result.devVerificationToken);
        setToken(result.devVerificationToken);
      }
      setNotice("A new verification message was recorded. The previous code no longer works.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not record another verification message.");
    }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    try {
      await api("/v1/auth/verify-email", { method: "POST", body: JSON.stringify({ token }) });
      sessionStorage.removeItem("devVerificationToken");
      setDone(true);
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not verify that email.");
    }
  }

  return (
    <AuthFrame>
      <h1>Confirm your email</h1>
      <p className="muted">Use the single-use code, or the link in the verification message. In this build that message is recorded locally. It is not sent through an outside email service. Confirming your email does not send memories.</p>
      <form onSubmit={submit}>
        <label htmlFor="token">Verification code</label>
        <input id="token" value={token} onChange={(event) => setToken(event.target.value)} required />
        {error ? <p className="error" role="alert">{error}</p> : null}
        {notice ? <p className="banner">{notice}</p> : null}
        {done ? <p className="banner">Email confirmed.</p> : null}
        <p><button type="submit">Confirm email</button></p>
      </form>
      <p><button type="button" className="secondary" onClick={() => void resend()}>Send a new code</button></p>
    </AuthFrame>
  );
}
