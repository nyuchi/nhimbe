/**
 * Washed theme definitions — single source of truth (mzizi doctrine 4.2.0).
 *
 * The 4.2.0 refresh replaces the old Five-Minerals theme list with the mzizi
 * **heritage** + **experimental** washed palettes as the selectable theme
 * options. Each palette is a fully-solved washed theme carrying, per light /
 * dark mode:
 *   • accent  (ui)           — the saturated mark colour
 *   • wash    (container)     — the surface tint used as the event page ground
 *   • onWash  (on_container)  — AAA-safe foreground on the wash
 *   • gradient                — the cover gradient
 *
 * IMPORTANT: these are per-event *theme options*. The app brand `--primary`
 * stays **tanzanite** in every theme (globals.css); the per-theme wash only
 * tints event surfaces/accents — it never replaces the brand lead. `tanzanite`
 * is the default option and mirrors the brand mineral.
 *
 * Used by: event-theme-wrapper, create-event theme picker, gradient-background.
 * (category-mineral maps categories → per-card accent minerals — a separate,
 * intentionally unchanged categorisation cue.)
 */

export interface ModeColors {
  /** accent (ui) — saturated mark colour. */
  accent: string;
  /** wash (container) — surface tint / page ground. */
  wash: string;
  /** foreground on the wash (on_container) — AAA-safe. */
  onWash: string;
  /** cover gradient for this mode. */
  gradient: string;
}

export interface WashedTheme {
  name: string;
  /** Canonical cover gradient persisted to events.coverGradient (light framing). */
  gradient: string;
  light: ModeColors;
  dark: ModeColors;
}

/** Build a washed theme from mzizi's fully-solved experimental palette values. */
function experimental(
  name: string,
  uiL: string,
  uiD: string,
  contL: string,
  contD: string,
  onL: string,
  onD: string,
): WashedTheme {
  const light: ModeColors = {
    accent: uiL,
    wash: contL,
    onWash: onL,
    gradient: `linear-gradient(135deg, ${onL}, ${uiL})`,
  };
  const dark: ModeColors = {
    accent: uiD,
    wash: contD,
    onWash: onD,
    gradient: `linear-gradient(135deg, ${uiD}, ${onD})`,
  };
  return { name, gradient: light.gradient, light, dark };
}

/**
 * Build a washed theme from a single heritage hex. mzizi's heritage records
 * ship only the hex, so we derive the container (wash) by mixing the hex into
 * the active surface (~8% light / ~14% dark) and pick an AAA on-container.
 * color-mix keeps the wash surface-relative so it adapts to light/dark.
 */
function heritage(name: string, hex: string): WashedTheme {
  const light: ModeColors = {
    accent: hex,
    wash: `color-mix(in srgb, ${hex} 8%, var(--surface))`,
    onWash: `color-mix(in srgb, ${hex} 82%, black)`,
    gradient: `linear-gradient(135deg, color-mix(in srgb, ${hex} 82%, black), ${hex})`,
  };
  const dark: ModeColors = {
    accent: `color-mix(in srgb, ${hex} 62%, white)`,
    wash: `color-mix(in srgb, ${hex} 14%, var(--surface))`,
    onWash: `color-mix(in srgb, ${hex} 48%, white)`,
    gradient: `linear-gradient(135deg, ${hex}, color-mix(in srgb, ${hex} 55%, white))`,
  };
  return { name, gradient: light.gradient, light, dark };
}

/** tanzanite — the nhimbe brand default option (mirrors the brand mineral). */
const tanzanite: WashedTheme = {
  name: "Tanzanite",
  gradient: "linear-gradient(135deg, #2E004D, #B388FF)",
  light: {
    accent: "#4B0082",
    wash: "color-mix(in srgb, #4B0082 8%, var(--surface))",
    onWash: "#2E004D",
    gradient: "linear-gradient(135deg, #2E004D, #4B0082)",
  },
  dark: {
    accent: "#B388FF",
    wash: "color-mix(in srgb, #B388FF 14%, var(--surface))",
    onWash: "#E1BEE7",
    gradient: "linear-gradient(135deg, #4B0082, #B388FF)",
  },
};

export const themes: Record<string, WashedTheme> = {
  // Brand default.
  tanzanite,

  // Heritage palette (mzizi styling-heritage-colors).
  baobab: heritage("Baobab", "#6D4C41"),
  hematite: heritage("Hematite", "#607D8B"),
  indigo: heritage("Indigo", "#3F51B5"),
  kalahari: heritage("Kalahari", "#D9C7A0"),
  river: heritage("River", "#0097A7"),
  savanna: heritage("Savanna", "#C9A227"),
  sunset: heritage("Sunset", "#FF7043"),

  // Experimental palette (mzizi styling-experimental) — fully solved washes.
  acacia: experimental("Acacia", "#7E8C22", "#768420", "#E9EBDB", "#333521", "#48510E", "#B6CE23"),
  dusk: experimental("Dusk", "#A35DD8", "#9749D3", "#E4DBEB", "#2D2135", "#661B9E", "#CC9FEF"),
  ember: experimental("Ember", "#CD5F33", "#BB562D", "#EBDFDB", "#352721", "#7A3115", "#EBA68A"),
  fern: experimental("Fern", "#259725", "#228D22", "#DBEBDB", "#213521", "#0F570F", "#28DB28"),
  lagoon: experimental("Lagoon", "#249383", "#218A7A", "#DBEBE9", "#213532", "#0E554B", "#24D6BC"),
  protea: experimental("Protea", "#D34998", "#CA3188", "#EBDBE4", "#35212D", "#841656", "#ED98C9"),
  storm: experimental("Storm", "#577BD6", "#426CD1", "#DBE0EB", "#212735", "#1A409B", "#99B2EE"),
};

/** Theme IDs for iteration (tanzanite first). */
export const themeIds = Object.keys(themes) as (keyof typeof themes)[];

/** @deprecated legacy alias — use `themes`. Kept so older imports resolve. */
export const mineralThemes = themes;
/** @deprecated legacy alias — use `themeIds`. */
export const mineralThemeIds = themeIds;

/** Resolve a theme by id, falling back to the tanzanite default. */
export function getTheme(themeId?: string): WashedTheme {
  return (themeId && themes[themeId]) || tanzanite;
}

/**
 * Extract an [onWash, accent, wash] colour tuple (dark mode) for a theme.
 * Retained for backward-compatible consumers that expect a 3-colour tuple.
 */
export function getThemeColors(themeId: string): [string, string, string] {
  const t = getTheme(themeId);
  return [t.dark.onWash, t.dark.accent, t.dark.wash];
}

/** Brand colors for background animations — tanzanite stays the nhimbe lead. */
export const brandColors = {
  light: {
    primary: "#4B0082",
    secondary: "#5E35B1",
    background: "#F3F3F1",
  },
  dark: {
    primary: "#B388FF",
    secondary: "#7C4DFF",
    background: "#0E0D0C",
  },
};
