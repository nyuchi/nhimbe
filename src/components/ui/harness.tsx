"use client";

import * as React from "react";

/* ═══════════════════════════════════════════════════════════════
   nyuchi component harness — zero-config infrastructure wiring

   The vertical spine that connects nhimbe's branded components to
   the infrastructure they all rely on: observability, a11y, error
   resilience, skeleton loading, motion, theme, and locale.

   This module is built up in layers. First layer: motion — entry
   animations that honour `prefers-reduced-motion` and the
   `--motion-duration-*` / `--motion-ease-*` design tokens.
   ═══════════════════════════════════════════════════════════════ */

// ─── motion (design-token driven, reduced-motion aware) ─────────

/** Read the user's reduced-motion preference (SSR-safe). */
export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export interface MotionConfig {
  /** Whether the user prefers reduced motion. */
  prefersReduced: boolean;
  /** Duration for entry animations in ms (0 if reduced motion). */
  enterDuration: number;
  /** Duration for exit animations in ms (0 if reduced motion). */
  exitDuration: number;
  /** CSS easing for entry. */
  enterEasing: string;
  /** CSS easing for exit. */
  exitEasing: string;
  /** Stagger delay (ms) for the item at `index` in a list. */
  staggerDelay: (index: number) => number;
  /** CSS class that plays the shared entry animation. */
  enterClass: string;
}

function getMotionConfig(): MotionConfig {
  const reduced = prefersReducedMotion();
  return {
    prefersReduced: reduced,
    enterDuration: reduced ? 0 : 200,
    exitDuration: reduced ? 0 : 100,
    enterEasing: reduced ? "linear" : "cubic-bezier(0, 0, 0.2, 1)",
    exitEasing: reduced ? "linear" : "cubic-bezier(0.4, 0, 1, 1)",
    staggerDelay: (index: number) => (reduced ? 0 : Math.min(index, 8) * 50),
    enterClass: reduced ? "" : "nyuchi-animate-in",
  };
}

export interface AnimStyleOptions {
  /** Keyframe name to play. */
  keyframe?: string;
  /** Duration — a CSS length or token. Defaults to the `--motion-duration-md` token. */
  duration?: string;
  /** Easing — a CSS timing function or token. Defaults to the `--motion-ease-out` token. */
  easing?: string;
  /** Delay in ms (e.g. for stagger). */
  delay?: number;
  /** `animation-fill-mode`. */
  fill?: string;
}

/**
 * Build a `React.CSSProperties` entry animation that honours
 * `prefers-reduced-motion` and the motion design tokens. When reduced
 * motion is requested (or `reduced` is forced), returns `{}` so nothing
 * animates. Uses `--motion-duration-*` / `--motion-ease-*` tokens with
 * sensible fallbacks so it works even before those tokens are defined.
 */
export function animStyle(
  options: AnimStyleOptions = {},
  reduced: boolean = prefersReducedMotion()
): React.CSSProperties {
  if (reduced) return {};
  const {
    keyframe = "nyuchi-fade-slide-up",
    duration = "var(--motion-duration-md, 200ms)",
    easing = "var(--motion-ease-out, cubic-bezier(0, 0, 0.2, 1))",
    delay = 0,
    fill = "both",
  } = options;
  const delayPart = delay > 0 ? ` ${delay}ms` : "";
  return { animation: `${keyframe} ${duration} ${easing}${delayPart} ${fill}` };
}

// ─── keyframe injection (keeps globals.css untouched) ──────────
// The shared entry keyframes ship with the harness itself so the token
// PR keeps sole ownership of globals.css. Injection is idempotent and
// runs once per document.

const HARNESS_STYLE_ID = "nyuchi-harness-keyframes";
const HARNESS_KEYFRAMES = `
@keyframes nyuchi-fade-slide-up {
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: translateY(0); }
}
.nyuchi-animate-in {
  animation: nyuchi-fade-slide-up var(--motion-duration-md, 200ms) var(--motion-ease-out, cubic-bezier(0, 0, 0.2, 1)) both;
}
@media (prefers-reduced-motion: reduce) {
  .nyuchi-animate-in { animation: none; }
}
`;

function ensureHarnessKeyframes(): void {
  if (typeof document === "undefined") return;
  if (document.getElementById(HARNESS_STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = HARNESS_STYLE_ID;
  style.textContent = HARNESS_KEYFRAMES;
  document.head.appendChild(style);
}

/** Ensure the shared entry keyframes exist for the current document. */
export function useHarnessKeyframes(): void {
  React.useEffect(() => {
    ensureHarnessKeyframes();
  }, []);
}
