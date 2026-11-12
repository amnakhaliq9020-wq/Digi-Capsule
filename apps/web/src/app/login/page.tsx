"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AuthFrame } from "@/components/AuthFrame";
import { ApiError, api } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    try {
      await api("/v1/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
      if (window.sessionStorage.getItem("digi-share-return") === "1") {
        window.sessionStorage.removeItem("digi-share-return");
        router.push("/share");
        return;
      }
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not sign in.");
    }
  }

  return (
    <AuthFrame>
      <h1>Sign in</h1>
      <form onSubmit={submit}>
        <label htmlFor="email">Email</label>
        <input id="email" type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} required aria-invalid={error ? true : undefined} />
        <label htmlFor="password">Password</label>
        <input id="password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required aria-invalid={error ? true : undefined} />
        {error ? <p className="error" role="alert">{error}</p> : null}
        <p><button type="submit">Sign in</button></p>
      </form>
      <p className="muted"><Link href="/forgot-password">Forgot password</Link></p>
      <p className="muted">New here? <Link href="/signup">Create an account</Link></p>
    </AuthFrame>
  );
}
