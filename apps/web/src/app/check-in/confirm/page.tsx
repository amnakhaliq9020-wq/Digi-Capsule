"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AuthFrame } from "@/components/AuthFrame";
import { ApiError, api } from "@/lib/api";

export default function ConfirmCheckInPage() {
  const [token, setToken] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    setToken(new URLSearchParams(window.location.search).get("token") || "");
  }, []);

  async function confirm() {
    setError("");
    setPending(true);
    try {
      const result = await api<{ message: string }>("/v1/check-in/confirm", {
        method: "POST",
        body: JSON.stringify({ token }),
      });
      setMessage(result.message);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not confirm activity.");
    } finally {
      setPending(false);
    }
  }

  return (
    <AuthFrame>
      <h1>Confirm you are active</h1>
      <p className="muted">This records that you can still reach Digi Capsule. It does not send a memory, and it is not a finding about anyone's death. The link works once.</p>
      {error ? <p className="error" role="alert">{error}</p> : null}
      {message ? <p className="banner">{message}</p> : null}
      <p><button type="button" onClick={() => void confirm()} disabled={!token || pending}>{pending ? "Saving…" : "I'm Active"}</button></p>
      <p className="muted"><Link href="/login">Sign in</Link> if this link has expired.</p>
    </AuthFrame>
  );
}
