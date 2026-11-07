"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useState } from "react";
import { api } from "@/lib/api";

const links = [
  ["/dashboard", "Dashboard", "M4 11.5 12 5l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1z"],
  ["/memories", "My memories", "M6 4h9l3 3v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zM9 12h6M9 16h6"],
  ["/memories/new", "Create memory", "M12 5v14M5 12h14"],
  ["/contacts", "Contacts", "M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM3 19a5 5 0 0 1 10 0M16 11a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM16 13.2a4.2 4.2 0 0 1 4 3.8"],
  ["/deliveries", "Scheduled deliveries", "M5 6h14v12H5zM8 4v4M16 4v4M5 10h14"],
  ["/check-in", "Check-in", "M12 7v5l3 2M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z"],
  ["/warnings", "Warning history", "M12 4 3 19h18L12 4zM12 10v4M12 16.5h.01"],
  ["/account", "Time zone", "M12 7a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM4 19a8 8 0 0 1 16 0"],
  ["/dev", "Test console", "M8 8 4 12l4 4M16 8l4 4-4 4"],
];

const TimeZoneContext = createContext("UTC");

export function useTimeZone() {
  return useContext(TimeZoneContext);
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

  return (
    <div className="shell">
      <a className="skip" href="#content">Skip to content</a>
      <aside className="nav">
        <p className="brand"><img className="logo mark" src="/logo.png" alt="" width={36} height={36} /> Digi <span>Capsule</span></p>
        <p className="who">{name ? `Signed in as ${name}` : "Loading…"}</p>
        <nav className="nav-links" aria-label="Account">
          {links.filter(([href]) => href !== "/dev" || testMode).map(([href, label, icon]) => (
            <Link key={href} href={href} className={path === href ? "active" : ""} aria-current={path === href ? "page" : undefined}>
              <svg className="nav-icon" viewBox="0 0 24 24" aria-hidden="true"><path d={icon} /></svg>
              {label}
            </Link>
          ))}
        </nav>
        <button className="secondary logout" onClick={() => void api("/v1/auth/logout", { method: "POST" }).then(() => router.replace("/login")).catch(() => router.replace("/login"))}>
          Log out
        </button>
      </aside>
      <TimeZoneContext.Provider value={timeZone}>
        <main className="main" id="content">{children}</main>
      </TimeZoneContext.Provider>
    </div>
  );
}
