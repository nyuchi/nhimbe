import { describe, it, expect } from "vitest";
import {
  themes,
  themeIds,
  getTheme,
  getThemeColors,
  mineralThemes,
  mineralThemeIds,
} from "./themes";

/**
 * Guards the mzizi 4.2.0 washed theme surface: heritage + experimental
 * palettes as the selectable options, tanzanite the default, and every
 * palette carrying a solved { accent, wash, onWash, gradient } for light+dark.
 */
describe("washed themes (mzizi 4.2.0)", () => {
  const HERITAGE = ["baobab", "hematite", "indigo", "kalahari", "river", "savanna", "sunset"];
  const EXPERIMENTAL = ["acacia", "dusk", "ember", "fern", "lagoon", "protea", "storm"];

  it("offers tanzanite (default) + heritage + experimental palettes", () => {
    expect(themeIds[0]).toBe("tanzanite");
    for (const id of [...HERITAGE, ...EXPERIMENTAL]) {
      expect(themeIds).toContain(id);
    }
    // 1 default + 7 heritage + 7 experimental.
    expect(themeIds.length).toBe(15);
  });

  it("gives every palette a full light + dark washed spec", () => {
    for (const id of themeIds) {
      const t = themes[id];
      expect(t.name).toBeTruthy();
      for (const mode of ["light", "dark"] as const) {
        expect(t[mode].accent).toBeTruthy();
        expect(t[mode].wash).toBeTruthy();
        expect(t[mode].onWash).toBeTruthy();
        expect(t[mode].gradient).toContain("linear-gradient");
      }
    }
  });

  it("derives heritage washes as surface-relative color-mix (adapts to mode)", () => {
    expect(themes.river.light.wash).toContain("color-mix");
    expect(themes.river.light.wash).toContain("var(--surface)");
  });

  it("falls back to tanzanite for unknown / missing ids", () => {
    expect(getTheme("not-a-theme").name).toBe("Tanzanite");
    expect(getTheme(undefined).name).toBe("Tanzanite");
    expect(getTheme("dusk").name).toBe("Dusk");
  });

  it("returns a 3-colour tuple from getThemeColors", () => {
    const tuple = getThemeColors("storm");
    expect(tuple).toHaveLength(3);
    expect(tuple.every((c) => typeof c === "string" && c.length > 0)).toBe(true);
  });

  it("keeps the legacy mineralThemes / mineralThemeIds aliases resolving", () => {
    expect(mineralThemes).toBe(themes);
    expect(mineralThemeIds).toBe(themeIds);
  });
});
