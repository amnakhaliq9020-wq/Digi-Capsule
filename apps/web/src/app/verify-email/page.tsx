"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ApiError, api } from "@/lib/api";

export default function VerifyEmailPage() {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    const saved = sessionStorage.getItem("devVerificationToken");
    if (saved) setToken(saved);
  }, []);

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
    <main className="hero card">
      <h1>Confirm your email</h1>
      <p className="muted">In local development the code is shown here and in the test console. A production email provider would send it instead. Confirming your email does not send memories.</p>
      <form onSubmit={submit}>
        <label htmlFor="token">Verification code</label>
        <input id="token" value={token} onChange={(event) => setToken(event.target.value)} required />
        {error ? <p className="error">{error}</p> : null}
        {done ? <p>Email confirmed.</p> : null}
        <p><button type="submit">Confirm email</button></p>
      </form>
    </main>
  );
}
