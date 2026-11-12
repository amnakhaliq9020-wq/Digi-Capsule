"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Shell } from "@/components/Shell";
import { ApiError, api } from "@/lib/api";
import { formatWhen } from "@/lib/time";

const TOKEN_KEY = "digi-share-token";

type Opened = {
  access: "granted";
  expiresAt: string;
  recipientTimeZone: string;
  file: { id: string; mimeType: string; originalName: string; kind: "photo" | "video" };
};

export default function SharePage() {
  return <Shell><ShareBody /></Shell>;
}

function ShareBody() {
  const [state, setState] = useState<"checking" | "need-sign-in" | "ready" | "blocked">("checking");
  const [opened, setOpened] = useState<Opened | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let cancelled = false;
    function openLink() {
      const hash = window.location.hash.replace(/^#/, "");
      if (hash) window.sessionStorage.setItem(TOKEN_KEY, hash);
      const token = hash || window.sessionStorage.getItem(TOKEN_KEY) || "";
      if (hash) window.history.replaceState(null, "", "/share");
      if (token) window.sessionStorage.setItem("digi-share-return", "1");
      if (!token) {
        setState("blocked");
        setMessage("This link is not valid.");
        return;
      }
      api<Opened>("/v1/media/shares/open", { method: "POST", body: JSON.stringify({ token }) })
        .then((result) => {
          if (cancelled) return;
          window.sessionStorage.removeItem(TOKEN_KEY);
          window.sessionStorage.removeItem("digi-share-return");
          setOpened(result);
          setState("ready");
        })
        .catch((err) => {
          if (cancelled) return;
          if (err instanceof ApiError && err.status === 401) {
            window.sessionStorage.setItem("digi-share-return", "1");
            setState("need-sign-in");
            setMessage("Sign in with the recipient account to open this file.");
            return;
          }
          window.sessionStorage.removeItem("digi-share-return");
          setState("blocked");
          setMessage(err instanceof ApiError ? err.message : "This link is not valid.");
        });
    }
    openLink();
    window.addEventListener("hashchange", openLink);
    return () => {
      cancelled = true;
      window.removeEventListener("hashchange", openLink);
    };
  }, []);

  return (
    <article className="stack">
      <h1>Private file</h1>
      {state === "checking" ? <p className="loading">Checking this link…</p> : null}
      {state === "need-sign-in" ? (
        <>
          <p className="muted">{message}</p>
          <Link className="button" href="/login">Sign in</Link>
        </>
      ) : null}
      {state === "blocked" ? <p className="error" role="alert">{message}</p> : null}
      {state === "ready" && opened ? (
        <div className="card stack">
          <p className="muted">Expires {formatWhen(opened.expiresAt, opened.recipientTimeZone)} ({opened.recipientTimeZone}).</p>
          {opened.file.kind === "video"
            ? <video src={`/v1/media/${opened.file.id}/content`} controls />
            : <img src={`/v1/media/${opened.file.id}/content`} alt={opened.file.originalName} />}
          <a href={`/v1/media/${opened.file.id}/content`} download={opened.file.originalName}>Download {opened.file.originalName}</a>
        </div>
      ) : null}
    </article>
  );
}
