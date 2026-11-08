import type { Metadata } from "next";
import Link from "next/link";
import { PublicDocument } from "@/components/landing/MarketingChrome";
import { policyVersion, routes } from "@/components/landing/site";

export const metadata: Metadata = {
  title: "Terms — Digi Capsule",
  description: "What Digi Capsule is, and what this application does not do.",
};

export default function TermsPage() {
  return (
    <PublicDocument
      kicker={`Version ${policyVersion}`}
      title="Terms"
      lede="These terms describe the Digi Capsule application in this build. They are not a substitute for advice from a lawyer. Creating an account stores a record that version 2026-11-05 of these terms and the privacy notice was accepted."
    >
      <h2>What the product is</h2>
      <p>Digi Capsule is a private place to keep letters, photographs, and videos for people you name, and to hold a memory until a date you choose. You control the drafts, the recipients, and the delivery condition.</p>
      <h2>What the product is not</h2>
      <ul>
        <li>It is not a will, a probate service, or a way to transfer property.</li>
        <li>It does not decide that someone has died, and a missed check-in is not proof of death.</li>
        <li>It does not release memories saved as If I am gone while the application is running in production.</li>
        <li>It does not send releases, warnings, or verification codes through an outside email or SMS provider in this build. A chosen date is recorded for the people you named inside the application.</li>
        <li>It does not include an AI face or voice. That experience is planned and is not available.</li>
      </ul>
      <h2>Your account</h2>
      <p>You need an email address and a password. You confirm the email with a code shown in the application. You choose a time zone so a scheduled date has a local meaning. Sign-out ends the current session.</p>
      <h2>Your memories</h2>
      <p>Do not upload something you do not have the right to store. Photos are limited to 15 MB and videos to 100 MB unless the server limits are configured differently. A draft is private. Scheduling a memory names the people and the condition; it does not by itself send mail.</p>
      <p>The privacy practices are in the <Link href={routes.privacy}>privacy notice</Link>.</p>
    </PublicDocument>
  );
}
