import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { ShamwariIcon } from "./shamwari-icon";

afterEach(() => {
  cleanup();
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: undefined,
  });
});

describe("ShamwariIcon", () => {
  it("defaults to an accessible label", () => {
    const { container } = render(<ShamwariIcon />);
    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("role")).toBe("img");
    expect(svg?.getAttribute("aria-label")).toBe("Shamwari AI");
    expect(svg?.getAttribute("aria-hidden")).toBeNull();
  });

  it("honours a custom aria-label", () => {
    const { container } = render(<ShamwariIcon aria-label="Ask Shamwari" />);
    expect(container.querySelector("svg")?.getAttribute("aria-label")).toBe("Ask Shamwari");
  });

  it("goes decorative when marked aria-hidden, dropping role and label", () => {
    const { container } = render(<ShamwariIcon aria-hidden="true" />);
    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("aria-hidden")).toBe("true");
    expect(svg?.getAttribute("role")).toBeNull();
    expect(svg?.getAttribute("aria-label")).toBeNull();
  });

  it("animates by default", () => {
    const { container } = render(<ShamwariIcon />);
    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("style")).toContain("shamwari-icon-pulse");
  });

  it("skips animation when animate=false", () => {
    const { container } = render(<ShamwariIcon animate={false} />);
    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("style") ?? "").not.toContain("shamwari-icon-pulse");
  });

  it("respects a forced size prop", () => {
    const { container } = render(<ShamwariIcon size={32} />);
    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("width")).toBe("32");
    expect(svg?.getAttribute("height")).toBe("32");
  });
});
