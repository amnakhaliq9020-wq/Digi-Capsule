export const palette = {
  navy: "#F4FFF9",
  blueSoft: "#12352C",
  teal: "#3DFFC2",
  tealHover: "#7DFFE0",
  background: "#071510",
  card: "#10261F",
  text: "#F4FFF9",
  secondary: "#C5DDD2",
  border: "#1E463A",
  borderStrong: "#5DBE9A",
  error: "#FFB4A8",
  errorSoft: "#3A1714",
  success: "#B6F5D4",
  successSoft: "#123528",
  onAccent: "#042117",
} as const;

export const visionPalettes = {
  protanopia: { text: "#F7FBFF", background: "#071018", card: "#121A24", accent: "#9EC9FF", onAccent: "#071018", muted: "#D5E2F2", status: "#FFE08A" },
  deuteranopia: { text: "#F4FBFF", background: "#071014", card: "#121C22", accent: "#7FD0FF", onAccent: "#071014", muted: "#D2E4EE", status: "#FFBF70" },
  tritanopia: { text: "#FFF5F8", background: "#120810", card: "#24141C", accent: "#FF8FB8", onAccent: "#2A0A16", muted: "#F0D5DF", status: "#FFD6E4" },
  achromatopsia: { text: "#FFFFFF", background: "#101010", card: "#1C1C1C", accent: "#FFFFFF", onAccent: "#101010", muted: "#D0D0D0", status: "#E8E8E8" },
} as const;

function channel(value: number) {
  const ratio = value / 255;
  return ratio <= 0.03928 ? ratio / 12.92 : ((ratio + 0.055) / 1.055) ** 2.4;
}

export function contrastRatio(foreground: string, background: string) {
  const luminance = (hex: string) => {
    const value = hex.replace("#", "");
    const red = channel(Number.parseInt(value.slice(0, 2), 16));
    const green = channel(Number.parseInt(value.slice(2, 4), 16));
    const blue = channel(Number.parseInt(value.slice(4, 6), 16));
    return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
  };
  const lighter = Math.max(luminance(foreground), luminance(background));
  const darker = Math.min(luminance(foreground), luminance(background));
  return (lighter + 0.05) / (darker + 0.05);
}
