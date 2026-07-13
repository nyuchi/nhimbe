import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Guards the mzizi design-system doctrine 4.1.0 token surface in globals.css so
 * a future edit can't silently drop the pill radii, the extended scales, or the
 * deliberate nhimbe divergences (tanzanite primary, compact control heights).
 */
const css = readFileSync(
  resolve(process.cwd(), "src/app/globals.css"),
  "utf8",
);

describe("mzizi doctrine 4.1.0 tokens", () => {
  it("makes buttons and inputs pill-shaped (radius-full)", () => {
    expect(css).toMatch(/--radius-button:\s*9999px/);
    expect(css).toMatch(/--radius-input:\s*9999px/);
    // Card aligns to the 14px (--radius-lg) family.
    expect(css).toMatch(/--radius-card:\s*14px/);
    // Doctrine radius aliases resolve.
    expect(css).toMatch(/--radius-base:\s*14px/);
    expect(css).toMatch(/--radius-2xl:\s*17px/);
  });

  it("exposes the extended 4.1.0 spacing ladder", () => {
    for (const token of [
      "--space-xxs",
      "--space-xs-plus",
      "--space-sm-plus",
      "--space-base-plus",
      "--space-xl-plus",
      "--space-2xl-plus",
      "--space-4xl",
      "--space-5xl",
      "--space-6xl",
    ]) {
      expect(css).toContain(token);
    }
  });

  it("adds the 4.1.0 typography + mono tokens", () => {
    expect(css).toMatch(/--fs-display-sm:\s*3\.75rem/);
    expect(css).toMatch(/--fs-h6:\s*1rem/);
    expect(css).toMatch(/--fs-code:\s*0\.875rem/);
    expect(css).toMatch(/--lh-h6:/);
    expect(css).toMatch(/--font-mono:\s*"JetBrains Mono"/);
  });

  it("adds the missing shadow/elevation rungs", () => {
    expect(css).toMatch(/--shadow-none:\s*none/);
    expect(css).toContain("--shadow-xs:");
    expect(css).toContain("--shadow-inner:");
    expect(css).toContain("--shadow-focus-ring:");
  });

  it("aliases motion durations and adds spring + stagger tokens", () => {
    expect(css).toMatch(/--motion-duration-quick:\s*var\(--motion-quick\)/);
    expect(css).toMatch(/--motion-duration-dramatic:\s*var\(--motion-dramatic\)/);
    expect(css).toMatch(/--motion-ease-spring:\s*cubic-bezier\(0\.34,\s*1\.56,\s*0\.64,\s*1\)/);
    expect(css).toContain("--motion-stagger-tight:");
    expect(css).toContain("--motion-stagger-base:");
    expect(css).toContain("--motion-stagger-loose:");
  });

  it("keeps tanzanite as the brand primary (NOT cobalt)", () => {
    // --primary must resolve to tanzanite in every theme block.
    expect(css).toMatch(/--primary:\s*var\(--tanzanite\)/);
    // Cobalt stays the exceptional mineral (links/info), never --primary.
    expect(css).not.toMatch(/--primary:\s*var\(--cobalt\)/);
  });

  it("keeps nhimbe's compact touch-target scale (not the doctrine 56px)", () => {
    expect(css).toMatch(/--touch-target-lg:\s*48px/);
    expect(css).toMatch(/--touch-target:\s*40px/);
    expect(css).toMatch(/--touch-target-sm:\s*34px/);
    // Control heights are token-driven so the team can flip to doctrine later.
    expect(css).toContain("--h-button-default:");
    expect(css).toContain("--h-input:");
  });
});
