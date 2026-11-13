"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useState } from "react";
import { Icon, type IconName } from "@/components/icons/Icon";
import { api } from "@/lib/api";

const links: ReadonlyArray<readonly [string, string, IconName]> = [
  ["/dashboard", "Home", "home"],
  ["/memories", "Memories", "memories"],
  ["/contacts", "Contacts", "contacts"],
  ["/deliveries", "Scheduled messages", "calendar"],
  ["/check-in", "Check-in", "clock"],
  ["/warnings", "Warnings", "warning"],
  ["/account", "Settings", "settings"],
  ["/dev", "Test console", "help"],
];

const bottom: ReadonlyArray<readonly [string, string, IconName]> = [
  ["/dashboard", "Home", "home"],
  ["/memories", "Memories", "memories"],
  ["/check-in", "Check-in", "clock"],
  ["/contacts", "Contacts", "contacts"],
];

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
      .catch(() => {
        if (path !== "/share") router.replace("/login");
      });
    api<{ testMode: boolean }>("/v1/health").then((data) => setTestMode(data.testMode)).catch(() => undefined);
  }, [path, router]);

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
          <button type="submit"><Icon name="search" /> <span className="label-wide">Search</span></button>
        </form>
        <div className="top-actions">
          <Link className="button secondary label-wide" href="/warnings">Warnings</Link>
          <Link className="button secondary label-wide" href="/deliveries">Schedule</Link>
          <Link className="button secondary" href="/account" title={name ? `Signed in as ${name}` : "Settings"}>
            Settings
          </Link>
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
                <Icon name={icon} />
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
        {bottom.map(([href, label, icon]) => (
          <Link key={href} href={href} aria-current={isCurrent(href, path) ? "page" : undefined}><Icon name={icon} /> {label}</Link>
        ))}
      </nav>
    </div>
  );
}
