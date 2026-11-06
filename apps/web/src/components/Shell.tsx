"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";

const links = [
  ["/dashboard", "Dashboard"],
  ["/memories", "My memories"],
  ["/memories/new", "Create memory"],
  ["/contacts", "Contacts"],
  ["/deliveries", "Scheduled deliveries"],
  ["/check-in", "Check-in"],
  ["/warnings", "Warning history"],
  ["/dev", "Test console"],
];

export function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const [name, setName] = useState("");
  const [testMode, setTestMode] = useState(false);

  useEffect(() => {
    api<{ user: { displayName: string } }>("/v1/auth/me")
      .then((data) => setName(data.user.displayName))
      .catch(() => router.replace("/login"));
    api<{ testMode: boolean }>("/v1/health").then((data) => setTestMode(data.testMode)).catch(() => undefined);
  }, [router]);

  return (
    <div className="shell">
      <aside className="nav">
        <p className="brand"><img className="logo mark" src="/logo.png" alt="" width={36} height={36} /> Digi <span>Capsule</span></p>
        <p>{name ? `Signed in as ${name}` : "Loading…"}</p>
        {links.filter(([href]) => href !== "/dev" || testMode).map(([href, label]) => (
          <Link key={href} href={href} className={path === href ? "active" : ""}>{label}</Link>
        ))}
        <button className="secondary" style={{ marginTop: 18 }} onClick={async () => { await api("/v1/auth/logout", { method: "POST" }); router.replace("/login"); }}>
          Log out
        </button>
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}
