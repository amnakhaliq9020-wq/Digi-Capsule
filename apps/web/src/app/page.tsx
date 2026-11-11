import type { Metadata } from "next";
import { LandingPage } from "@/components/landing/LandingPage";
import { SessionRedirect } from "@/components/landing/SessionRedirect";

const title = "Digi Capsule — Memories are forever. Now their moments can be too.";
const description = "Preserve what matters today. Share it with the people who matter tomorrow. Digi Capsule is a digital time capsule for personal messages, memories, photos, and videos.";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"),
  title,
  description,
  openGraph: {
    title,
    description,
    type: "website",
    siteName: "Digi Capsule",
    images: [{ url: "/logo.png", alt: "Digi Capsule logo" }],
  },
  twitter: {
    card: "summary",
    title,
    description,
    images: ["/logo.png"],
  },
};

export default function HomePage() {
  return (
    <>
      <SessionRedirect />
      <LandingPage />
    </>
  );
}
