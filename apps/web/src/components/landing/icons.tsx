import type { ApplicationIcon } from "./site";
import styles from "./landing.module.css";

const common = {
  viewBox: "0 0 32 32",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true as const,
  className: styles.icon,
};

export function AppIcon({ name }: { name: ApplicationIcon }) {
  if (name === "family") {
    return (
      <svg {...common}>
        <circle cx="11" cy="11" r="3" />
        <circle cx="21" cy="12" r="2.4" />
        <path d="M5.5 23c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5" />
        <path d="M18 18.2c1.6-.5 3.3-.2 4.6 1.3 1 1.2 1.6 2.6 1.9 3.5" />
      </svg>
    );
  }
  if (name === "occasion") {
    return (
      <svg {...common}>
        <path d="M8 14h16v10H8z" />
        <path d="M8 18h16M16 14v10" />
        <path d="M12 14c0-2 1.2-4 4-4s4 2 4 4" />
      </svg>
    );
  }
  if (name === "child") {
    return (
      <svg {...common}>
        <circle cx="16" cy="11" r="3.2" />
        <path d="M9 24c.8-3.6 3.2-5.5 7-5.5s6.2 1.9 7 5.5" />
        <path d="M23 8.5l.7 1.6 1.6.2-1.2 1.1.3 1.6L23 12.2l-1.4.8.3-1.6-1.2-1.1 1.6-.2z" />
      </svg>
    );
  }
  if (name === "distance") {
    return (
      <svg {...common}>
        <path d="M7 22c3-6 4.2-9 4.2-11a3.2 3.2 0 1 0-6.4 0C4.8 13 6 16 7 22z" />
        <circle cx="6.8" cy="11" r="1" fill="currentColor" stroke="none" />
        <path d="M22 22c3-6 4.2-9 4.2-11a3.2 3.2 0 1 0-6.4 0c0 2 1.2 5 2.2 11z" />
        <circle cx="21.8" cy="11" r="1" fill="currentColor" stroke="none" />
        <path d="M11 18h7" />
      </svg>
    );
  }
  if (name === "milestone") {
    return (
      <svg {...common}>
        <path d="M8 26V7" />
        <path d="M8 8h12l-2.2 4 2.2 4H8" />
        <path d="M14 26h12" />
      </svg>
    );
  }
  if (name === "letter") {
    return (
      <svg {...common}>
        <path d="M6 9h20v14H6z" />
        <path d="M7 10l9 7 9-7" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <rect x="6" y="8" width="20" height="16" rx="2" />
      <circle cx="12" cy="14" r="1.6" />
      <path d="M8 22l5.2-4.4 3.2 2.6 3-2.4L24 22" />
    </svg>
  );
}
