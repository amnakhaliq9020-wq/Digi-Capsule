import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { closing, footerInfo, hero, privacy, routes, timeMeaning, vision } from "./site";

describe("landing story", () => {
  it("introduces the product with the brand slogan", () => {
    expect(routes.signIn).toBe("/login");
    expect(routes.start).toBe("/signup");
    expect(hero.slogan).toBe("Memories are forever. Now their moments can be too.");
    expect(hero.support).toBe("Preserve what matters today. Share it with the people who matter tomorrow.");
    expect(hero.primary).toBe("Get Early Access");
    expect(hero.secondary).toBe("Discover Our Purpose");
    expect(closing.title).toBe("Some messages are worth waiting for.");
    expect(closing.action).toBe("Join the Early Access List");
  });

  it("keeps the footer on real information pages", () => {
    expect(footerInfo.map((item) => item.label)).toEqual(["Privacy Policy", "Terms of Service", "Contact"]);
    expect(footerInfo.map((item) => item.href)).toEqual(["/privacy", "/terms", "/contact"]);
  });

  it("treats future scenes as illustrations", () => {
    expect(timeMeaning.note.toLowerCase()).toContain("not a description of a particular delivery feature");
    expect(vision.statement).toContain("should not be limited by time");
  });

  it("describes only the privacy protections that exist", () => {
    const claims = privacy.paragraphs.join(" ").toLowerCase();
    expect(claims).toContain("argon2id");
    expect(claims).toContain("aes-256-gcm");
    expect(claims).toContain("httponly");
    expect(claims).toContain("does not send memories through an outside email");
    expect(claims).toContain("does not promise that a message will be delivered");
    expect(claims).not.toContain("military-grade");
    expect(claims).not.toContain("guaranteed");
    expect(claims).not.toContain("end-to-end");
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
