export const palette = {
  navy: "#173B57",
  blueSoft: "#E8F1F7",
  teal: "#167D83",
  tealHover: "#0F5C61",
  background: "#F8FAFC",
  card: "#FFFFFF",
  text: "#172B3A",
  secondary: "#52616B",
  border: "#D5DEE5",
  borderStrong: "#4E6270",
  error: "#B42318",
  errorSoft: "#F8E4E2",
  success: "#217346",
  successSoft: "#E5F4EB",
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
