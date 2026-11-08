import Link from "next/link";
import type { ReactNode } from "react";
import { SectionMenu } from "./SectionMenu";
import { footerExplore, footerInfo, routes } from "./site";
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
          <nav className={styles.desktopNav} aria-label="Primary">
            {footerExplore.map((item) => (
              <Link key={item.href} href={item.href}>{item.label}</Link>
            ))}
          </nav>
          <SectionMenu />
          <div className={styles.actions}>
            <Link className={styles.signIn} href={routes.signIn}>Sign in</Link>
            <Link className={styles.primary} href={routes.start}>Get Started</Link>
          </div>
        </div>
      </header>
      <main id="content" tabIndex={-1} className={styles.main}>
        {children}
      </main>
      <footer className={styles.footer}>
        <div className={`${styles.wrap} ${styles.footerGrid}`}>
          <div>
            <p className={styles.footerTitle}>Digi Capsule</p>
            <p>Your memories. Your moments. Your legacy.</p>
            <p className={styles.legal}>A private memory application. It is not a will, and it does not decide that someone has died.</p>
          </div>
          <nav aria-label="Footer">
            <ul>
              {footerExplore.map((item) => (
                <li key={item.href}><Link href={item.href}>{item.label}</Link></li>
              ))}
            </ul>
          </nav>
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
