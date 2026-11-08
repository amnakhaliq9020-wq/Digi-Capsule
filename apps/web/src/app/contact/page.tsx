import type { Metadata } from "next";
import Link from "next/link";
import { PublicDocument } from "@/components/landing/MarketingChrome";
import { routes } from "@/components/landing/site";

export const metadata: Metadata = {
  title: "Contact — Digi Capsule",
  description: "How to reach Digi Capsule in this build. No public support inbox is configured.",
};

export default function ContactPage() {
  return (
    <PublicDocument
      kicker="Contact"
      title="There is no public inbox in this build."
      lede="Digi Capsule does not publish a support email address here, and this page does not send a message. A contact form would pretend to deliver mail that this application does not send."
    >
      <h2>If you are new</h2>
      <p><Link href={routes.start}>Create an account</Link> to keep a private memory. You will confirm the email with a code shown in the application.</p>
      <h2>If you already have an account</h2>
      <p><Link href={routes.signIn}>Sign in</Link> to open your memories, contacts, and check-in.</p>
      <h2>Privacy and terms</h2>
      <p>Read the <Link href={routes.privacy}>privacy notice</Link> and the <Link href={routes.terms}>terms</Link> for what the application stores and what it refuses to do.</p>
    </PublicDocument>
  );
}
