import type { Metadata } from "next";
import { LandingPage } from "@/components/landing/LandingPage";

export const metadata: Metadata = {
  title: "Digi Capsule — Your Memories. Your Moments. Your Legacy.",
  description: "Digi Capsule keeps private letters, photographs, and videos for the people you choose, and holds them until a date you set.",
};

export default function HomePage() {
  return <LandingPage />;
}
