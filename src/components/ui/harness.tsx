"use client";

import * as React from "react";
import { createLogger } from "@/lib/observability";
import { getLocale, type Locale } from "@/lib/i18n";

/* ═══════════════════════════════════════════════════════════════
   nyuchi component harness — zero-config infrastructure wiring

   The vertical spine that connects nhimbe's branded components to
   the infrastructure they all rely on: observability, a11y, error
   resilience, skeleton loading, motion, theme, and locale.

   Built up in layers: motion, then observability, then theme/locale,
   then the hook + declarative wrapper that compose them.
   ═══════════════════════════════════════════════════════════════ */

// ─── scoped logger (backed by observability) ───────────────────
// Each component gets its own logger. We reuse the shared
// `[mukoko:<module>]` logger from `src/lib/observability.ts` rather than
// inventing a second logging channel; the scoped signature below is the
// contract brand components compile against.

export interface ScopedLogger {
  debug: (message: string, data?: Record<string, unknown>) => void;
  info: (message: string, data?: Record<string, unknown>) => void;
  warn: (message: string, data?: Record<string, unknown>) => void;
  error: (message: string, error?: Error, data?: Record<string, unknown>) => void;
}

function createScopedLogger(componentName: string): ScopedLogger {
  const logger = createLogger(componentName);
  return {
    debug: (message, data) => logger.debug(message, { data }),
    info: (message, data) => logger.info(message, { data }),
    warn: (message, data) => logger.warn(message, { data }),
    error: (message, error, data) => logger.error(message, { error, data }),
  };
}

/** Component health status reported through the scoped logger. */
export type HealthStatus = "healthy" | "degraded" | "error" | "loading";

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

// ─── resolved theme (reads ThemeProvider's output) ─────────────
// ThemeProvider writes `light`/`dark` onto <html>. We read that class so
// the harness reflects the resolved theme without coupling to (or
// throwing outside of) the provider — safe in tests and RSC hydration.

type ResolvedTheme = "light" | "dark";

function getResolvedTheme(): ResolvedTheme {
  if (typeof document === "undefined") return "dark";
  return document.documentElement.classList.contains("light") ? "light" : "dark";
}

function subscribeToThemeClass(callback: () => void): () => void {
  if (typeof document === "undefined") return () => {};
  const observer = new MutationObserver(callback);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class"],
  });
  return () => observer.disconnect();
}

function useResolvedTheme(): ResolvedTheme {
  return React.useSyncExternalStore(
    subscribeToThemeClass,
    getResolvedTheme,
    () => "dark" as ResolvedTheme
  );
}

// ─── token verifier (dev-only) ─────────────────────────────────
// Warns when the mineral/radius tokens are missing, which almost always
// means the theme was not mounted above this component.

function useTokenVerifier(componentName: string): void {
  React.useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    if (typeof window === "undefined") return;

    const style = getComputedStyle(document.documentElement);
    const requiredTokens = [
      "--color-tanzanite",
      "--color-cobalt",
      "--color-gold",
      "--color-terracotta",
      "--radius-card",
    ];
    const missing = requiredTokens.filter(
      (token) => !style.getPropertyValue(token).trim()
    );
    if (missing.length > 0) {
      createLogger(componentName).warn(
        `Missing CSS tokens: ${missing.join(", ")}. Is the theme mounted above this component?`,
        { data: { missing } }
      );
    }
  }, [componentName]);
}

// Re-exported so leaf components can read the active locale directly.
export { getLocale };
export type { Locale, ResolvedTheme };
