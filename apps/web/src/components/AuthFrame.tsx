import Link from "next/link";
import type { ReactNode } from "react";

export function AuthFrame({ children }: { children: ReactNode }) {
  return (
    <div className="public">
      <a className="skip" href="#content">Skip to content</a>
      <header className="topbar">
        <Link className="brand" href="/">
          <img className="logo mark" src="/logo.png" alt="" width={40} height={40} />
          Digi Capsule
        </Link>
        <div className="top-actions">
          <Link className="button secondary" href="/login">Sign in</Link>
          <Link className="button" href="/signup">Create an account</Link>
        </div>
      </header>
      <main className="hero card" id="content" tabIndex={-1}>{children}</main>
    </div>
  );
}
