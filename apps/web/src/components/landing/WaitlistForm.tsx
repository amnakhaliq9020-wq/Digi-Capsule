"use client";

import { useState } from "react";
import { ApiError, api } from "@/lib/api";
import styles from "./landing.module.css";

export function WaitlistForm() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setMessage("");
    setPending(true);
    try {
      const result = await api<{ status: "joined" | "already_joined" }>("/v1/waitlist", {
        method: "POST",
        body: JSON.stringify({ email }),
      });
      setMessage(result.status === "already_joined" ? "That email is already on the list." : "You're on the list. This email is saved for early access.");
      setEmail("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save that email.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form className={styles.waitlist} id="waitlist" onSubmit={(event) => void submit(event)}>
      <label className="sr-only" htmlFor="waitlist-email">Email</label>
      <input id="waitlist-email" name="email" type="email" autoComplete="email" required placeholder="you@email.com" value={email} onChange={(event) => setEmail(event.target.value)} aria-invalid={error ? true : undefined} aria-describedby={error ? "waitlist-error" : message ? "waitlist-status" : undefined} />
      <button type="submit" disabled={pending}>{pending ? "Saving…" : "Join the Early Access List"}</button>
      {error ? <p id="waitlist-error" className={styles.formError} role="alert">{error}</p> : null}
      {message ? <p id="waitlist-status" className={styles.formStatus} role="status">{message}</p> : null}
    </form>
  );
}
