"use client";

import Link from "next/link";
import { useState } from "react";
import { primaryNav } from "./site";
import styles from "./landing.module.css";

export function SectionMenu() {
  const [open, setOpen] = useState(false);

  return (
    <div className={styles.menu}>
      <button
        type="button"
        className={styles.menuButton}
        aria-expanded={open}
        aria-controls="section-menu"
        onClick={() => setOpen((current) => !current)}
      >
        Menu
      </button>
      {open ? (
        <nav id="section-menu" className={styles.menuPanel} aria-label="Sections">
          {primaryNav.map((item) => (
            <Link key={item.href} href={item.href} onClick={() => setOpen(false)}>{item.label}</Link>
          ))}
        </nav>
      ) : null}
    </div>
  );
}
