import type { Metadata } from "next";
import Link from "next/link";
import { PublicDocument } from "@/components/landing/MarketingChrome";
import { policyVersion, routes } from "@/components/landing/site";

export const metadata: Metadata = {
  title: "Privacy Policy — Digi Capsule",
  description: "How Digi Capsule stores accounts, letters, photos, videos, and delivery choices in this application.",
};

export default function PrivacyPage() {
  return (
    <PublicDocument
      kicker={`Notice version ${policyVersion}`}
      title="Privacy notice"
      lede={`This notice describes what this application actually does with an account. It is not a certification, and it is not a legal opinion. Creating an account stores a record that version ${policyVersion} of this notice and the terms was accepted.`}
    >
      <h2>What you can store</h2>
      <p>An account holds your name, email address, password, time zone, contacts, memories, and the photos or videos you attach. A memory can include a letter. You choose the recipients and the delivery condition.</p>
      <h2>How it is protected</h2>
      <ul>
        <li>Passwords are stored as Argon2id hashes. The password itself is not stored.</li>
        <li>Sign-in uses an HttpOnly session cookie with SameSite set to Lax. In production the cookie is marked Secure. The server stores a hash of the session token. Sign-out revokes that session.</li>
        <li>Letter text is encrypted with AES-256-GCM before it is stored.</li>
        <li>Photos and videos are kept in private storage. There is no permanent public link. The API checks the signed-in account before it opens a file. A temporary file link can be issued for that owner and it expires. Those files are not given a separate application-layer encryption step.</li>
        <li>The server checks the file signature, the size, and the account upload limit. A browser-only check is not the control.</li>
        <li>Password reset uses a single-use token stored only as a hash. It expires. Resetting the password signs out existing sessions. The reset message is recorded by this application and is not sent through an outside email service.</li>
        <li>The API rate-limits requests, including repeated sign-in failures. A change sent from a different site origin is refused.</li>
      </ul>
      <h2>Who can see a memory</h2>
      <p>A draft stays in your account. Trusted contacts and verifiers are not given your drafts. A scheduled memory is recorded for the people you named when its date arrives. This build does not send that release through an outside email or SMS service.</p>
      <h2>Check-ins</h2>
      <p>I’m Alive records that you are reachable and sets the next check-in 30 days later. It does not send a memory. Missed check-ins are recorded as warnings. Those warnings do not include the letter. Memories saved as If I am gone are not released in production.</p>
      <h2>Email codes</h2>
      <p>Email confirmation uses a single-use code and a link. In this build that message is recorded locally, because an outside mail provider is not connected. The code is also shown after registration while test mode is on. Confirming an email does not send memories. Scheduling a memory requires that confirmation.</p>
      <h2>What this notice does not cover</h2>
      <p>There is no face or voice avatar in Digi Capsule today. Saving a memory does not train one. This notice does not promise a particular storage region, a retention period after deletion, or a public support inbox. Account deletion is not available in this application.</p>
      <p>Read the <Link href={routes.terms}>terms</Link> or the <Link href={routes.contact}>contact</Link> page for what this build can and cannot do.</p>
    </PublicDocument>
  );
}
