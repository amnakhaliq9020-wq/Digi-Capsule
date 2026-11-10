"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import styles from "./landing.module.css";

export function WaitlistForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const next = new URLSearchParams({ email });
    router.push(`/signup?${next.toString()}`);
  }

  return (
    <form className={styles.waitlist} onSubmit={submit}>
      <label className="sr-only" htmlFor="waitlist-email">Email</label>
      <input id="waitlist-email" type="email" autoComplete="email" required placeholder="you@email.com" value={email} onChange={(event) => setEmail(event.target.value)} />
      <button type="submit">Join waitlist</button>
    </form>
  );
}
