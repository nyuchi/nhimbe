import { render } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { axe } from "vitest-axe";
import { MoonPhase } from "./moon-phase";

describe("MoonPhase accessibility", () => {
  // Fixed dates picked to cover each phase bucket so axe sees the live
  // SVG rendered with its phase-specific aria-label.
  const cases: Array<[string, Date]> = [
    ["new moon", new Date(Date.UTC(2024, 0, 11))],
    ["waxing crescent", new Date(Date.UTC(2024, 0, 14))],
    ["first quarter", new Date(Date.UTC(2024, 0, 18))],
    ["waxing gibbous", new Date(Date.UTC(2024, 0, 22))],
    ["full moon", new Date(Date.UTC(2024, 0, 25))],
    ["waning crescent", new Date(Date.UTC(2024, 1, 8))],
  ];

  for (const [label, date] of cases) {
    it(`has no a11y violations for ${label}`, async () => {
      const { container } = render(<MoonPhase date={date} />);
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });
  }

  it("exposes an aria-label on the SVG role=img", () => {
    const { container } = render(<MoonPhase date={new Date(Date.UTC(2024, 0, 25))} />);
    const svg = container.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(svg?.getAttribute("role")).toBe("img");
    expect(svg?.getAttribute("aria-label")).toBeTruthy();
  });
});
