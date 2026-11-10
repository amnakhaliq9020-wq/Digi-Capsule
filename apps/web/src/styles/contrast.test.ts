import { describe, expect, it } from "vitest";
import { contrastRatio, palette } from "./contrast";

describe("accessible color pairs", () => {
  it("keeps normal text at 4.5:1 or higher", () => {
    const pairs = [
      [palette.text, palette.card],
      [palette.text, palette.background],
      [palette.secondary, palette.card],
      [palette.secondary, palette.background],
      [palette.navy, palette.blueSoft],
      [palette.navy, palette.card],
      [palette.onAccent, palette.teal],
      [palette.onAccent, palette.tealHover],
      ["#FFFFFF", "#B42318"],
      [palette.success, palette.background],
      [palette.error, palette.errorSoft],
      [palette.success, palette.successSoft],
    ] as const;
    for (const [foreground, background] of pairs) {
      expect(contrastRatio(foreground, background), `${foreground} on ${background}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("keeps input borders at 3:1 against the card", () => {
    expect(contrastRatio(palette.borderStrong, palette.card)).toBeGreaterThanOrEqual(3);
  });

  it("does not treat the pale decorative border as an input boundary", () => {
    expect(contrastRatio(palette.border, palette.card)).toBeLessThan(3);
  });
});
