import Link from "next/link";
import { CapsuleArt } from "./CapsuleArt";
import { AppIcon } from "./icons";
import { MarketingChrome } from "./MarketingChrome";
import {
  applications,
  closing,
  deliveryNote,
  features,
  future,
  hero,
  heroFacts,
  routes,
  securityControls,
  securityIntro,
  securityLimits,
  steps,
  vision,
} from "./site";
import styles from "./landing.module.css";

export function LandingPage() {
  return (
    <MarketingChrome>
      <section className={styles.wrap} aria-labelledby="hero-title">
        <div className={styles.hero}>
          <div>
            <p className={styles.kicker}>{hero.kicker}</p>
            <h1 id="hero-title">
              {hero.lines.map((line) => (
                <span key={line} className={line.endsWith("Legacy.") ? styles.accent : undefined}>{line}</span>
              ))}
            </h1>
            <p className={styles.lede}>{hero.lede}</p>
            <div className={styles.heroActions}>
              <Link className={styles.primary} href={routes.start}>{hero.primary}</Link>
              <Link className={styles.secondary} href={routes.features}>{hero.secondary}</Link>
            </div>
            <ul className={styles.facts}>
              {heroFacts.map((fact) => (
                <li key={fact.title}><strong>{fact.title}</strong><span>{fact.body}</span></li>
              ))}
            </ul>
          </div>
          <CapsuleArt />
        </div>
      </section>

      <section className={`${styles.section} ${styles.wrap}`} id="about" aria-labelledby="vision-title">
        <div className={styles.vision} id="vision">
          <div>
            <p className={styles.kicker}>{vision.kicker}</p>
            <h2 id="vision-title">{vision.title}</h2>
          </div>
          <div>
            {vision.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
          </div>
        </div>
      </section>

      <section className={`${styles.section} ${styles.wrap}`} id="how-it-works" aria-labelledby="steps-title">
        <p className={styles.kicker}>How it works</p>
        <h2 id="steps-title">From a private draft to a moment you choose.</h2>
        <p className={styles.sectionLead}>You write it, you name the people, and you set the condition. Nothing leaves because a check-in was missed.</p>
        <ol className={styles.steps}>
          {steps.map((step) => (
            <li key={step.title}>
              <h3>{step.title}</h3>
              <p>{step.body}</p>
            </li>
          ))}
        </ol>
        <aside className={styles.note} aria-label="What delivery does in this build">
          <p>{deliveryNote}</p>
        </aside>
      </section>

      <section className={`${styles.section} ${styles.wrap}`} id="applications" aria-labelledby="applications-title">
        <p className={styles.kicker}>Multiple applications</p>
        <h2 id="applications-title">One private capsule, many moments.</h2>
        <p className={styles.sectionLead}>The same account can hold a family story, a future birthday letter, or the photographs from a day you do not want to lose.</p>
        <ul className={styles.bento}>
          {applications.map((item, index) => (
            <li key={item.title} className={index === 0 ? styles.tall : index === applications.length - 1 ? styles.span2 : undefined}>
              <AppIcon name={item.icon} />
              <h3>{item.title}</h3>
              <p>{item.body}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className={`${styles.section} ${styles.wrap}`} id="features" aria-labelledby="features-title">
        <p className={styles.kicker}>Core features</p>
        <h2 id="features-title">What you can do in Digi Capsule today.</h2>
        <ul className={styles.features}>
          {features.map((feature) => (
            <li key={feature.title}>
              <h3>{feature.title}</h3>
              <p>{feature.body}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className={`${styles.section} ${styles.band}`} id="security" aria-labelledby="security-title">
        <div className={styles.wrap}>
          <p className={styles.kicker}>{securityIntro.kicker}</p>
          <h2 id="security-title">{securityIntro.title}</h2>
          <p className={styles.sectionLead}>{securityIntro.body}</p>
          <ul className={styles.controls}>
            {securityControls.map((control) => (
              <li key={control.title}>
                <h3>{control.title}</h3>
                <p>{control.body}</p>
              </li>
            ))}
          </ul>
          <aside className={styles.note}>
            <p>{securityLimits}</p>
          </aside>
          <p><Link className={styles.textLink} href={routes.privacy}>Read the privacy notice</Link></p>
        </div>
      </section>

      <section className={`${styles.section} ${styles.wrap}`} id="future" aria-labelledby="future-title">
        <div className={styles.futureCard}>
          <p className={styles.stamp}>{future.status}</p>
          <p className={styles.kicker}>{future.kicker}</p>
          <h2 id="future-title">{future.title}</h2>
          <p className={styles.lede}>{future.body}</p>
          <p>{future.boundary}</p>
        </div>
      </section>

      <section className={styles.cta} aria-labelledby="cta-title">
        <div className={styles.wrap}>
          <h2 id="cta-title">{closing.title}</h2>
          <p>{closing.body}</p>
          <Link className={styles.primary} href={routes.start}>{closing.action}</Link>
        </div>
      </section>
    </MarketingChrome>
  );
}
