import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  applications,
  closing,
  deliveryNote,
  features,
  footerInfo,
  future,
  hero,
  primaryNav,
  routes,
  securityControls,
  securityLimits,
  steps,
} from "./site";

describe("landing navigation", () => {
  it("sends account actions to the existing auth routes", () => {
    expect(routes.start).toBe("/signup");
    expect(routes.signIn).toBe("/login");
    expect(hero.primary).toBe("Get Started");
    expect(hero.secondary).toBe("Explore Features");
    expect(closing.action).toBe("Create Your First Capsule");
    expect(closing.title).toBe("Some Moments Deserve to Last Forever.");
  });

  it("links the footer to about, features, privacy, terms, and contact", () => {
    expect(footerInfo.map((item) => item.label)).toEqual(["About", "Features", "Privacy Policy", "Terms", "Contact"]);
    expect(footerInfo.map((item) => item.href)).toEqual(["/#about", "/#features", "/privacy", "/terms", "/contact"]);
    expect(primaryNav.map((item) => item.href).every((href) => href.startsWith("/#"))).toBe(true);
  });

  it("keeps the requested story sections", () => {
    expect(hero.lines.join(" ")).toBe("Your Memories. Your Moments. Your Legacy.");
    expect(steps.map((step) => step.title)).toEqual([
      "Create your account.",
      "Save meaningful memories and messages.",
      "Choose trusted contacts and delivery conditions.",
      "Let your memories reach their recipients at the right time.",
    ]);
    expect(applications).toHaveLength(7);
    expect(features.map((feature) => feature.title)).toEqual([
      "Digital time capsules",
      "Scheduled delivery",
      "Trusted contacts",
      "Media storage",
      "Special occasion releases",
      "Liveness confirmation",
    ]);
  });

  it("describes only the security that exists and marks the avatar as planned", () => {
    const claims = [deliveryNote, securityLimits, ...securityControls.map((item) => item.body)].join(" ").toLowerCase();
    expect(claims).toContain("argon2id");
    expect(claims).toContain("aes-256-gcm");
    expect(claims).toContain("httponly");
    expect(claims).toContain("not released in production");
    expect(claims).not.toContain("soc 2");
    expect(claims).not.toContain("bank-grade");
    expect(claims).not.toContain("end-to-end");
    expect(future.status).toBe("Planned");
    expect(future.boundary.toLowerCase()).toContain("not available today");
  });
});

describe("landing responsiveness", () => {
  it("collapses the marketing layout for phone, tablet, and desktop widths", () => {
    const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "landing.module.css"), "utf8");
    expect(css).toContain("@media (max-width: 560px)");
    expect(css).toContain("@media (min-width: 720px)");
    expect(css).toContain("@media (min-width: 900px)");
    expect(css).toContain("@media (min-width: 1080px)");
    expect(css).toContain("grid-template-columns: 1fr 1fr");
    expect(css).toContain("grid-template-columns: repeat(4, minmax(0, 1fr))");
    expect(css).not.toContain("100vw");
  });
});
