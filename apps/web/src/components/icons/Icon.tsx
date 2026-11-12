import type { ReactNode, SVGProps } from "react";

export const iconNames = [
  "home",
  "memories",
  "capsule",
  "letter",
  "photo",
  "video",
  "recipients",
  "contacts",
  "trusted",
  "calendar",
  "clock",
  "notifications",
  "security",
  "privacy",
  "settings",
  "account",
  "edit",
  "delete",
  "upload",
  "download",
  "search",
  "success",
  "warning",
  "error",
  "help",
  "accessibility",
  "delivery",
  "pending",
] as const;

export type IconName = (typeof iconNames)[number];

type Props = {
  name: IconName;
  label?: string;
  className?: string;
} & Omit<SVGProps<SVGSVGElement>, "name">;

const stroke = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

/** A small sealed capsule used as the shared mark inside the family. */
function Seal({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect x="0" y="0" width="6" height="3.2" rx="1.6" {...stroke} />
      <path d="M0.4 1.6h5.2" {...stroke} />
    </g>
  );
}

const glyphs: Record<IconName, ReactNode> = {
  home: (
    <>
      <path d="M4 12.2 12 5.2l8 7" {...stroke} />
      <path d="M7 11.2v7.2c0 .7.5 1.1 1.2 1.1h7.6c.7 0 1.2-.4 1.2-1.1v-7.2" {...stroke} />
      <path d="M10.2 19.4v-3.1c0-.6.7-1 1.8-1s1.8.4 1.8 1v3.1" {...stroke} />
      <Seal x="9" y="8.2" />
    </>
  ),
  memories: (
    <>
      <rect x="4" y="4" width="16" height="5" rx="2.5" {...stroke} />
      <path d="M4.6 6.5h14.8" {...stroke} />
      <rect x="5" y="10.2" width="14" height="4.4" rx="2.2" {...stroke} />
      <rect x="6" y="15.8" width="12" height="4" rx="2" {...stroke} />
    </>
  ),
  capsule: (
    <>
      <rect x="8" y="3" width="8" height="18" rx="4" {...stroke} />
      <path d="M8.4 12h7.2" {...stroke} />
      <path d="M12 6.2v1.4M12 16.4v1.4" {...stroke} />
    </>
  ),
  letter: (
    <>
      <rect x="3.5" y="6" width="17" height="12" rx="2" {...stroke} />
      <path d="M4.2 7.2 12 12.4l7.8-5.2" {...stroke} />
      <Seal x="15.2" y="13.2" />
    </>
  ),
  photo: (
    <>
      <rect x="3.5" y="5" width="17" height="14" rx="2.5" {...stroke} />
      <circle cx="9" cy="10" r="1.6" {...stroke} />
      <path d="M4.5 16.5 9 13l3 2.2 2.4-1.8 4.6 3.2" {...stroke} />
    </>
  ),
  video: (
    <>
      <rect x="3" y="6" width="13" height="12" rx="2.5" {...stroke} />
      <path d="M16 10.2 21 7.8v8.4L16 13.8z" {...stroke} />
      <path d="M8.2 12h4.2" {...stroke} />
    </>
  ),
  recipients: (
    <>
      <circle cx="8" cy="9" r="2.2" {...stroke} />
      <circle cx="16" cy="9.4" r="1.8" {...stroke} />
      <path d="M3.8 17.5c.5-2.4 2.2-3.6 4.2-3.6s3.7 1.2 4.2 3.6" {...stroke} />
      <path d="M14.2 14.4c1.2-.3 2.5 0 3.4 1.2.6.8 1 1.6 1.2 2" {...stroke} />
    </>
  ),
  contacts: (
    <>
      <circle cx="12" cy="8.2" r="2.6" {...stroke} />
      <path d="M6.2 18.4c.8-3 2.8-4.6 5.8-4.6s5 1.6 5.8 4.6" {...stroke} />
      <Seal x="15.5" y="4" />
    </>
  ),
  trusted: (
    <>
      <path d="M12 3.5 18.5 6v4.6c0 3.4-2.4 6.2-6.5 7.9-4.1-1.7-6.5-4.5-6.5-7.9V6z" {...stroke} />
      <path d="M9.2 11.2 11.2 13.2 15 9.2" {...stroke} />
    </>
  ),
  calendar: (
    <>
      <rect x="4" y="5.5" width="16" height="14" rx="2.5" {...stroke} />
      <path d="M4 10h16M8 3.8v3.2M16 3.8v3.2" {...stroke} />
      <path d="M8 14.2h3.2M12.8 14.2H16" {...stroke} />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8" {...stroke} />
      <path d="M12 7.5V12l3 2" {...stroke} />
      <path d="M8.2 12h2.2" {...stroke} />
    </>
  ),
  notifications: (
    <>
      <path d="M6.5 16.5h11l-1.1-2.1V10a4.4 4.4 0 0 0-8.8 0v4.4z" {...stroke} />
      <path d="M10 17.2a2 2 0 0 0 4 0" {...stroke} />
      <Seal x="9" y="3.2" />
    </>
  ),
  security: (
    <>
      <rect x="6" y="10" width="12" height="9" rx="2" {...stroke} />
      <path d="M8.5 10V7.8a3.5 3.5 0 0 1 7 0V10" {...stroke} />
      <path d="M12 13.2v2.4" {...stroke} />
    </>
  ),
  privacy: (
    <>
      <path d="M2.8 12S6.2 7 12 7s9.2 5 9.2 5-3.4 5-9.2 5-9.2-5-9.2-5z" {...stroke} />
      <circle cx="12" cy="12" r="2.2" {...stroke} />
      <path d="M12 9.8v.6" {...stroke} />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" {...stroke} />
      <path d="M12 3.5v2.2M12 18.3v2.2M3.5 12h2.2M18.3 12h2.2M6 6l1.6 1.6M16.4 16.4 18 18M18 6l-1.6 1.6M7.6 16.4 6 18" {...stroke} />
    </>
  ),
  account: (
    <>
      <circle cx="12" cy="12" r="8" {...stroke} />
      <circle cx="12" cy="10" r="2.2" {...stroke} />
      <path d="M7.4 16.6c.8-1.8 2.4-2.7 4.6-2.7s3.8.9 4.6 2.7" {...stroke} />
    </>
  ),
  edit: (
    <>
      <path d="M13.2 5.2 18.6 10.6 9.2 20H4v-5.2z" {...stroke} />
      <path d="M11.4 7 16.8 12.4" {...stroke} />
    </>
  ),
  delete: (
    <>
      <path d="M5 8h14" {...stroke} />
      <path d="M9 8V5.8h6V8" {...stroke} />
      <path d="M7.2 8.2 8 19h8l.8-10.8" {...stroke} />
      <path d="M10.2 11.5v4.5M13.8 11.5v4.5" {...stroke} />
    </>
  ),
  upload: (
    <>
      <path d="M12 15.5V5.5" {...stroke} />
      <path d="M8.2 9.2 12 5.4l3.8 3.8" {...stroke} />
      <path d="M5 16.5v2.2c0 .7.6 1.3 1.4 1.3h11.2c.8 0 1.4-.6 1.4-1.3v-2.2" {...stroke} />
    </>
  ),
  download: (
    <>
      <path d="M12 4.5v10" {...stroke} />
      <path d="M8.2 10.8 12 14.6l3.8-3.8" {...stroke} />
      <path d="M5 16.5v2.2c0 .7.6 1.3 1.4 1.3h11.2c.8 0 1.4-.6 1.4-1.3v-2.2" {...stroke} />
    </>
  ),
  search: (
    <>
      <circle cx="10.5" cy="10.5" r="5.5" {...stroke} />
      <path d="M14.6 14.6 20 20" {...stroke} />
      <path d="M8.2 10.5h4.6" {...stroke} />
    </>
  ),
  success: (
    <>
      <circle cx="12" cy="12" r="8" {...stroke} />
      <path d="M8 12.2 10.8 15 16 9.2" {...stroke} />
    </>
  ),
  warning: (
    <>
      <path d="M12 4.2 3.6 19h16.8z" {...stroke} />
      <path d="M12 9.2v4.2" {...stroke} />
      <path d="M12 16.4h.01" {...stroke} />
    </>
  ),
  error: (
    <>
      <circle cx="12" cy="12" r="8" {...stroke} />
      <path d="M9 9l6 6M15 9l-6 6" {...stroke} />
    </>
  ),
  help: (
    <>
      <circle cx="12" cy="12" r="8" {...stroke} />
      <path d="M9.4 9.4a2.6 2.6 0 0 1 4.6 1.6c0 1.6-2 2-2 3.2" {...stroke} />
      <path d="M12 16.8h.01" {...stroke} />
    </>
  ),
  accessibility: (
    <>
      <circle cx="12" cy="5.2" r="1.6" {...stroke} />
      <path d="M6 9.2h12" {...stroke} />
      <path d="M12 9.2v4.2" {...stroke} />
      <path d="M12 13.4 8.4 19M12 13.4 15.6 19" {...stroke} />
    </>
  ),
  delivery: (
    <>
      <path d="M3.5 12.5 20.5 5.5 14 20.5l-2.2-6.2z" {...stroke} />
      <path d="M11.6 14.2 20.2 5.8" {...stroke} />
    </>
  ),
  pending: (
    <>
      <circle cx="12" cy="12" r="8" {...stroke} />
      <path d="M12 8v4.2" {...stroke} />
      <path d="M12 12.2h3" {...stroke} strokeDasharray="1.4 1.6" />
    </>
  ),
};

export function Icon({ name, label, className, ...props }: Props) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className ? `digi-icon ${className}` : "digi-icon"}
      aria-hidden={label ? undefined : true}
      role={label ? "img" : undefined}
      aria-label={label}
      {...props}
    >
      {glyphs[name]}
    </svg>
  );
}
