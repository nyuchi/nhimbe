"use client";

import { ReactNode } from "react";
import { themes, getTheme, type WashedTheme } from "@/lib/themes";

export { themes, themes as mineralThemes };

/**
 * Recover a theme id from a persisted cover-gradient string. Gradients are
 * built from each theme's accent hex, so we match on the accent substring.
 * Falls back to the tanzanite brand default.
 */
function getThemeFromGradient(gradient?: string): keyof typeof themes {
  if (!gradient) return "tanzanite";
  const g = gradient.toLowerCase();
  for (const [id, theme] of Object.entries(themes)) {
    const hex = `${theme.light.accent} ${theme.dark.accent} ${theme.gradient}`
      .toLowerCase()
      .match(/#[0-9a-f]{6}/g) ?? [];
    if (hex.some((h) => g.includes(h))) return id as keyof typeof themes;
  }
  return "tanzanite";
}

interface EventThemeWrapperProps {
  children: ReactNode;
  coverGradient?: string;
  themeId?: string;
}

/**
 * Grounds the event-detail page in the event's washed theme. Emits both the
 * light and dark palette values as inline CSS variables (deterministic — no
 * hydration mismatch); globals.css selects the active mode under `.light` /
 * `.dark` and computes the subtle `--wash` page ground (surface + accent).
 */
export function EventThemeWrapper({ children, coverGradient, themeId }: EventThemeWrapperProps) {
  const resolvedThemeId = themeId || getThemeFromGradient(coverGradient);
  const theme: WashedTheme = getTheme(resolvedThemeId);

  return (
    <div
      className="min-h-dvh event-themed-page"
      data-event-theme={resolvedThemeId}
      style={
        {
          "--ev-accent-l": theme.light.accent,
          "--ev-accent-d": theme.dark.accent,
          "--ev-onwash-l": theme.light.onWash,
          "--ev-onwash-d": theme.dark.onWash,
          "--ev-grad-l": theme.light.gradient,
          "--ev-grad-d": theme.dark.gradient,
        } as React.CSSProperties
      }
    >
      {children}
    </div>
  );
}

export { getThemeFromGradient };
