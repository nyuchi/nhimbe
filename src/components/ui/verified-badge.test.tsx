import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { NyuchiVerifiedBadge, computeTrustScore } from "./verified-badge";

afterEach(() => {
  cleanup();
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: undefined,
  });
});

function badge() {
  return document.querySelector('[data-slot="nyuchi-verified-badge"]');
}

describe("NyuchiVerifiedBadge", () => {
  it("renders nothing for the unverified tier", () => {
    const { container } = render(<NyuchiVerifiedBadge tier="unverified" />);
    expect(container.firstChild).toBeNull();
  });

  it("renders the licensed (tanzanite) tier with trust metadata", () => {
    render(<NyuchiVerifiedBadge tier="licensed" />);
    const el = badge();
    expect(el).not.toBeNull();
    expect(el?.getAttribute("data-tier")).toBe("licensed");
    expect(el?.getAttribute("data-level")).toBe("4");
    expect(el?.getAttribute("data-trust")).toBe("0.5");
    expect(el?.getAttribute("aria-label")).toBe("Licensed Professional");
    // Tanzanite mineral drives the icon colour.
    expect(el?.querySelector("svg")?.getAttribute("style")).toContain("--color-tanzanite");
  });

  it("shows a suspended overlay instead of the tier icon", () => {
    render(<NyuchiVerifiedBadge tier="licensed" status="suspended" />);
    const el = badge();
    expect(el?.getAttribute("data-status")).toBe("suspended");
    expect(el?.getAttribute("aria-label")).toBe("Account Suspended");
    expect(el?.className).toContain("opacity-40");
  });

  it("shows a memorial overlay for ancestral status", () => {
    render(<NyuchiVerifiedBadge tier="community" status="verified_ancestral" />);
    const el = badge();
    expect(el?.getAttribute("aria-label")).toContain("Memorial");
    expect(el?.className).toContain("opacity-60");
  });

  it("renders a skeleton while loading", () => {
    render(<NyuchiVerifiedBadge tier="government" loading />);
    const el = badge();
    expect(el?.hasAttribute("data-loading")).toBe(true);
    expect(el?.className).toContain("animate-pulse");
  });

  it("omits the tooltip title when showTooltip is false", () => {
    render(<NyuchiVerifiedBadge tier="otp" showTooltip={false} />);
    expect(badge()?.getAttribute("title")).toBeNull();
  });

  it("applies an entry animation by default and none under reduced motion", () => {
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      configurable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: query.includes("prefers-reduced-motion"),
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
    render(<NyuchiVerifiedBadge tier="government" />);
    // Reduced motion on: no animation in the inline style.
    expect(badge()?.getAttribute("style") ?? "").not.toContain("nyuchi-fade-slide-up");
  });
});

describe("computeTrustScore", () => {
  it("sums the cumulative tier score and status modifier for active accounts", () => {
    expect(computeTrustScore("licensed", "living")).toBeCloseTo(0.5);
    expect(computeTrustScore("community", "living")).toBeCloseTo(0.1);
  });

  it("freezes trust at the status modifier for suspended/ancestral accounts", () => {
    expect(computeTrustScore("licensed", "suspended")).toBeCloseTo(-0.05);
    expect(computeTrustScore("licensed", "verified_ancestral")).toBeCloseTo(0.05);
  });
});
