import { Icon, type IconName } from "@/components/icons/Icon";
import { WaitlistForm } from "./WaitlistForm";
import { MarketingChrome } from "./MarketingChrome";
import { audiences, closing, hero, privacy, timeMeaning, vision, what, why } from "./site";
import styles from "./landing.module.css";

export function LandingPage() {
  const sloganLead = hero.slogan.replace(hero.highlight, "");

  return (
    <MarketingChrome>
      <section className={styles.hero} aria-labelledby="hero-title">
        <div className={styles.heroCopy}>
          <p className={styles.support}>{hero.support}</p>
          <h1 id="hero-title">
            {sloganLead}
            <span className={styles.moment}>{hero.highlight}</span>
          </h1>
          <p className={styles.description}>{hero.description}</p>
          <div className={styles.heroActions}>
            <a className={styles.primary} href="#waitlist-email">{hero.primary}</a>
            <a className={styles.secondary} href="#purpose">{hero.secondary}</a>
          </div>
        </div>
        <div className={styles.presentation} aria-hidden="true">
          <div className={styles.halo} />
          <div className={styles.pedestal}>
            <img src="/logo.png" alt="" width={220} height={220} />
          </div>
        </div>
      </section>

      <section className={styles.section} id="what" aria-labelledby="what-title">
        <p className={styles.kicker}>{what.kicker}</p>
        <h2 id="what-title">{what.title}</h2>
        {what.paragraphs.map((paragraph) => <p key={paragraph} className={styles.proseLine}>{paragraph}</p>)}
      </section>

      <section className={styles.section} id="purpose" aria-labelledby="purpose-title">
        <p className={styles.kicker}>{why.kicker}</p>
        <h2 id="purpose-title">{why.title}</h2>
        <ol className={styles.story}>
          {why.points.map((point, index) => (
            <li key={point.title}>
              <span aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
              <h3>{point.title}</h3>
              <p>{point.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className={styles.section} id="time" aria-labelledby="time-title">
        <p className={styles.kicker}>{timeMeaning.kicker}</p>
        <h2 id="time-title">{timeMeaning.title}</h2>
        <p className={styles.proseLine}>{timeMeaning.intro}</p>
        <ul className={styles.examples}>
          {timeMeaning.examples.map((example, index) => (
            <li key={example.title}>
              <h3><Icon name={(["calendar", "letter", "contacts", "delivery"] as IconName[])[index]} /> {example.title}</h3>
              <p>{example.body}</p>
            </li>
          ))}
        </ul>
        <p className={styles.note}>{timeMeaning.note}</p>
      </section>

      <section className={styles.section} id="audiences" aria-labelledby="audiences-title">
        <p className={styles.kicker}>{audiences.kicker}</p>
        <h2 id="audiences-title">{audiences.title}</h2>
        <ul className={styles.people}>
          {audiences.groups.map((group, index) => (
            <li key={group.title}>
              <h3><Icon name={(["contacts", "account", "trusted", "memories", "capsule"] as IconName[])[index]} /> {group.title}</h3>
              <p>{group.body}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className={styles.vision} id="vision" aria-labelledby="vision-title">
        <p className={styles.kicker}>{vision.kicker}</p>
        <h2 id="vision-title">{vision.statement}</h2>
      </section>

      <section className={styles.section} id="privacy" aria-labelledby="privacy-title">
        <p className={styles.kicker}>{privacy.kicker}</p>
        <h2 id="privacy-title">{privacy.title}</h2>
        <div className={styles.trust}>
          {privacy.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
        </div>
      </section>

      <section className={styles.closing} id="early-access" aria-labelledby="closing-title">
        <h2 id="closing-title">{closing.title}</h2>
        <p>{closing.body}</p>
        <WaitlistForm />
      </section>
    </MarketingChrome>
  );
}
