"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { api } from "@/lib/api";

export const visionModes = ["default", "protanopia", "deuteranopia", "tritanopia", "achromatopsia"] as const;

export type VisionMode = (typeof visionModes)[number];

export type A11yPrefs = {
  colorVision: VisionMode;
  highContrast: boolean;
  largeText: boolean;
  reducedMotion: boolean;
};

export const defaultA11y: A11yPrefs = {
  colorVision: "default",
  highContrast: false,
  largeText: false,
  reducedMotion: false,
};

const STORAGE_KEY = "digi-a11y";

const A11yContext = createContext<{ prefs: A11yPrefs; update: (next: A11yPrefs) => void }>({
  prefs: defaultA11y,
  update: () => undefined,
});

export function useA11y() {
  return useContext(A11yContext);
}

export function readStoredA11y(): A11yPrefs {
  if (typeof window === "undefined") return defaultA11y;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultA11y;
    const parsed = JSON.parse(raw) as Partial<A11yPrefs>;
    const colorVision = visionModes.includes(parsed.colorVision as VisionMode) ? (parsed.colorVision as VisionMode) : "default";
    return {
      colorVision,
      highContrast: Boolean(parsed.highContrast),
      largeText: Boolean(parsed.largeText),
      reducedMotion: Boolean(parsed.reducedMotion),
    };
  } catch {
    return defaultA11y;
  }
}

export function applyA11y(prefs: A11yPrefs) {
  const root = document.documentElement;
  root.dataset.vision = prefs.colorVision;
  root.dataset.contrast = prefs.highContrast ? "high" : "default";
  root.dataset.text = prefs.largeText ? "large" : "default";
  const systemReduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  root.dataset.motion = prefs.reducedMotion || systemReduce ? "reduce" : "allow";
}

export function AccessibilityProvider({ children }: { children: React.ReactNode }) {
  const [prefs, setPrefs] = useState<A11yPrefs>(defaultA11y);

  useEffect(() => {
    const local = readStoredA11y();
    applyA11y(local);
    setPrefs(local);
    api<{ user: { accessibility?: Partial<A11yPrefs> | null } }>("/v1/auth/me")
      .then((data) => {
        if (!data.user.accessibility) return;
        const next = { ...defaultA11y, ...data.user.accessibility };
        if (!visionModes.includes(next.colorVision)) next.colorVision = "default";
        applyA11y(next);
        setPrefs(next);
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      })
      .catch(() => undefined);
  }, []);

  function update(next: A11yPrefs) {
    setPrefs(next);
    applyA11y(next);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    void api("/v1/auth/me", { method: "PATCH", body: JSON.stringify({ accessibility: next }) }).catch(() => undefined);
  }

  return <A11yContext.Provider value={{ prefs, update }}>{children}</A11yContext.Provider>;
}
