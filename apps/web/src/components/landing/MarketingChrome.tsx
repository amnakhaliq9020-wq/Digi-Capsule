import Link from "next/link";
import type { ReactNode } from "react";
import { footerInfo, routes } from "./site";
import styles from "./landing.module.css";

export function MarketingChrome({ children }: { children: ReactNode }) {
  return (
    <div className={styles.page}>
      <a className="skip" href="#content">Skip to content</a>
      <header className={styles.header}>
        <div className={styles.bar}>
          <Link className={styles.brand} href={routes.home}>
            <img src="/logo.png" alt="" width={40} height={40} />
            Digi Capsule
          </Link>
          <div className={styles.actions}>
            <Link className={styles.signIn} href={routes.signIn}>Sign in</Link>
            <Link className={styles.early} href={routes.start}>Get early access</Link>
          </div>
        </div>
      </header>
      <main id="content" tabIndex={-1} className={styles.main}>
        {children}
      </main>
      <footer className={styles.footer}>
        <div className={`${styles.wrap} ${styles.footerRow}`}>
          <p>© 2026 Digi Capsule</p>
          <nav aria-label="Information">
            <ul>
              {footerInfo.map((item) => (
                <li key={item.label}><Link href={item.href}>{item.label}</Link></li>
              ))}
            </ul>
          </nav>
        </div>
      </footer>
    </div>
  );
}

export function PublicDocument({ kicker, title, lede, children }: { kicker: string; title: string; lede: string; children: ReactNode }) {
  return (
    <MarketingChrome>
      <article className={styles.prose}>
        <p className={styles.kicker}>{kicker}</p>
        <h1>{title}</h1>
        <p className={styles.lede}>{lede}</p>
        {children}
      </article>
    </MarketingChrome>
  );
}
