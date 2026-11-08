import styles from "./landing.module.css";

export function CapsuleArt() {
  return (
    <div className={styles.art} aria-hidden="true">
      <svg viewBox="0 0 400 480">
        <defs>
          <linearGradient id="lp-sky" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#24344a" />
            <stop offset="0.55" stopColor="#3c315f" />
            <stop offset="1" stopColor="#1a2740" />
          </linearGradient>
          <linearGradient id="lp-glass" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#f7f4ff" stopOpacity="0.55" />
            <stop offset="0.45" stopColor="#d9d3ef" stopOpacity="0.28" />
            <stop offset="1" stopColor="#f3e6d0" stopOpacity="0.45" />
          </linearGradient>
          <radialGradient id="lp-core" cx="50%" cy="60%" r="50%">
            <stop offset="0" stopColor="#f6e2c4" />
            <stop offset="0.55" stopColor="#e7b07a" />
            <stop offset="1" stopColor="#8a5a28" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="lp-gold" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#f3e6d0" />
            <stop offset="1" stopColor="#c4925a" />
          </linearGradient>
        </defs>
        <rect x="8" y="8" width="384" height="464" rx="36" fill="url(#lp-sky)" />
        <g fill="none" stroke="#f3e6d0" strokeOpacity="0.45">
          <ellipse cx="200" cy="230" rx="156" ry="64" />
          <ellipse cx="200" cy="230" rx="120" ry="168" transform="rotate(18 200 230)" />
        </g>
        <g className={styles.glow}>
          <ellipse cx="200" cy="268" rx="70" ry="90" fill="url(#lp-core)" />
        </g>
        <rect x="148" y="78" width="104" height="300" rx="52" fill="url(#lp-glass)" stroke="url(#lp-gold)" strokeWidth="3" />
        <rect x="168" y="118" width="64" height="36" rx="8" fill="#fffdf8" fillOpacity="0.88" />
        <path d="M176 128h48M176 136h36M176 144h28" stroke="#3c315f" strokeWidth="1.4" strokeLinecap="round" />
        <rect x="168" y="168" width="64" height="48" rx="8" fill="#efe8dc" />
        <circle cx="182" cy="182" r="4" fill="#c4925a" />
        <path d="M174 206l14-12 10 8 12-10 12 14" fill="none" stroke="#3c315f" strokeWidth="1.4" strokeLinejoin="round" />
        <rect x="168" y="230" width="64" height="28" rx="8" fill="#fffdf8" fillOpacity="0.75" />
        <path d="M178 244h44" stroke="#1c4e4b" strokeWidth="1.6" strokeLinecap="round" />
        <ellipse cx="200" cy="86" rx="36" ry="14" fill="url(#lp-gold)" />
        <circle cx="200" cy="330" r="10" fill="none" stroke="#f3e6d0" strokeWidth="2" />
        <path d="M200 324v8M197 330h6" stroke="#f3e6d0" strokeWidth="1.4" strokeLinecap="round" />
        <circle cx="78" cy="120" r="3" fill="#f3e6d0" />
        <circle cx="324" cy="150" r="2.5" fill="#f3e6d0" />
        <circle cx="308" cy="330" r="3" fill="#e7b07a" />
      </svg>
      <p className={`${styles.chip} ${styles.chipOne}`}>A letter</p>
      <p className={`${styles.chip} ${styles.chipTwo}`}>A photograph</p>
      <p className={`${styles.chip} ${styles.chipThree}`}>A chosen date</p>
    </div>
  );
}
