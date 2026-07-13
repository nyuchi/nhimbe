import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, fireEvent } from "@testing-library/react";
import { NyuchiHeroStat } from "./nyuchi-hero-stat";

afterEach(() => {
  cleanup();
  Object.defineProperty(window, "matchMedia", { writable: true, configurable: true, value: undefined });
});

function hero() {
  return document.querySelector('[data-slot="nyuchi-hero-stat"]');
}

describe("NyuchiHeroStat", () => {
  it("renders the primary value, unit, condition and secondary stats", () => {
    const { getByText } = render(
      <NyuchiHeroStat
        title="Active Events"
        value="128"
        unit="live"
        condition="Growing"
        secondaryStats={[{ label: "RSVPs", value: "3.2K" }]}
      />,
    );
    expect(hero()?.getAttribute("aria-label")).toBe("Active Events");
    expect(getByText("128")).toBeTruthy();
    expect(getByText("live")).toBeTruthy();
    expect(getByText("Growing")).toBeTruthy();
    expect(getByText("3.2K")).toBeTruthy();
  });

  it("fires onShare when the share button is pressed", () => {
    const onShare = vi.fn();
    const { getByLabelText } = render(<NyuchiHeroStat title="Views" value="1.2K" onShare={onShare} />);
    fireEvent.click(getByLabelText("Share Views"));
    expect(onShare).toHaveBeenCalledOnce();
  });

  it("renders a loading skeleton", () => {
    render(<NyuchiHeroStat title="x" value="0" loading />);
    expect(hero()?.hasAttribute("data-loading")).toBe(true);
    expect(hero()?.getAttribute("aria-busy")).toBe("true");
  });
});
