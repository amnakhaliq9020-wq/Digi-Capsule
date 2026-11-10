"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useState } from "react";
import { api } from "@/lib/api";

const links = [
  ["/dashboard", "Home", "M4 11.5 12 5l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1z"],
  ["/memories", "Memories", "M6 4h9l3 3v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zM9 12h6M9 16h6"],
  ["/contacts", "Contacts", "M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM3 19a5 5 0 0 1 10 0M16 11a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM16 13.2a4.2 4.2 0 0 1 4 3.8"],
  ["/deliveries", "Scheduled messages", "M5 6h14v12H5zM8 4v4M16 4v4M5 10h14"],
  ["/check-in", "Check-in", "M12 7v5l3 2M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z"],
  ["/warnings", "Warnings", "M12 4 3 19h18L12 4zM12 10v4M12 16.5h.01"],
  ["/account", "Settings", "M12 7a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM4 19a8 8 0 0 1 16 0"],
  ["/dev", "Test console", "M8 8 4 12l4 4M16 8l4 4-4 4"],
] as const;

const bottom = [
  ["/dashboard", "Home"],
  ["/memories", "Memories"],
  ["/contacts", "Contacts"],
  ["/deliveries", "Schedule"],
] as const;

const TimeZoneContext = createContext("UTC");

export function useTimeZone() {
  return useContext(TimeZoneContext);
}

function isCurrent(href: string, path: string) {
  if (href === "/dashboard") return path === "/dashboard";
  if (href === "/memories") return path.startsWith("/memories");
  return path === href || path.startsWith(`${href}/`);
}

export function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const [name, setName] = useState("");
  const [timeZone, setTimeZone] = useState("UTC");
  const [testMode, setTestMode] = useState(false);

  useEffect(() => {
    api<{ user: { displayName: string; timeZone: string } }>("/v1/auth/me")
      .then((data) => {
        setName(data.user.displayName);
        if (data.user.timeZone) setTimeZone(data.user.timeZone);
      })
      .catch(() => router.replace("/login"));
    api<{ testMode: boolean }>("/v1/health").then((data) => setTestMode(data.testMode)).catch(() => undefined);
  }, [router]);

  const visible = links.filter(([href]) => href !== "/dev" || testMode);

  return (
    <div className="app">
      <a className="skip" href="#content">Skip to content</a>
      <header className="topbar">
        <Link className="brand" href="/dashboard">
          <img className="logo mark" src="/logo.png" alt="" width={40} height={40} />
          Digi Capsule
        </Link>
        <form className="search" role="search" action="/memories">
          <label className="sr-only" htmlFor="memory-search">Search memories</label>
          <input id="memory-search" name="q" type="search" placeholder="Search memories" />
          <button type="submit">Search</button>
        </form>
        <div className="top-actions">
          <Link className="button secondary" href="/warnings">Warnings</Link>
          <Link className="button secondary" href="/account">{name ? name : "Settings"}</Link>
          <button type="button" className="secondary" onClick={() => void api("/v1/auth/logout", { method: "POST" }).then(() => router.replace("/login")).catch(() => router.replace("/login"))}>
            Log out
          </button>
        </div>
      </header>
      <div className="shell">
        <aside className="nav">
          <nav className="nav-links" aria-label="Account">
            {visible.map(([href, label, icon]) => (
              <Link key={href} href={href} className={isCurrent(href, path) ? "active" : ""} aria-current={isCurrent(href, path) ? "page" : undefined}>
                <svg className="nav-icon" viewBox="0 0 24 24" aria-hidden="true"><path d={icon} /></svg>
                {label}
              </Link>
            ))}
          </nav>
        </aside>
        <TimeZoneContext.Provider value={timeZone}>
          <main className="main" id="content" tabIndex={-1}>{children}</main>
        </TimeZoneContext.Provider>
      </div>
      <nav className="bottom-nav" aria-label="Primary">
        {bottom.map(([href, label]) => (
          <Link key={href} href={href} aria-current={isCurrent(href, path) ? "page" : undefined}>{label}</Link>
        ))}
      </nav>
    </div>
  );
}
