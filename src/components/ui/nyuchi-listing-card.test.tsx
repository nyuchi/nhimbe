import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, fireEvent } from "@testing-library/react";
import { NyuchiListingCard } from "./nyuchi-listing-card";

afterEach(() => {
  cleanup();
  Object.defineProperty(window, "matchMedia", { writable: true, configurable: true, value: undefined });
});

function card() {
  return document.querySelector('[data-slot="nyuchi-listing-card"]');
}

describe("NyuchiListingCard", () => {
  it("renders a row with the mineral left-border accent and links via href", () => {
    render(<NyuchiListingCard variant="row" title="Sunday Run" mineral="malachite" href="/events/1" />);
    const el = card();
    expect(el?.tagName).toBe("A");
    expect(el?.getAttribute("href")).toBe("/events/1");
    expect(el?.getAttribute("data-mineral")).toBe("malachite");
    expect(el?.getAttribute("data-variant")).toBe("row");
    expect(el?.className).toContain("border-l-[var(--color-malachite)]");
  });

  it("defaults the mineral accent to tanzanite (the brand lead)", () => {
    render(<NyuchiListingCard variant="row" title="Untagged" href="/events/x" />);
    expect(card()?.getAttribute("data-mineral")).toBe("tanzanite");
    expect(card()?.className).toContain("border-l-[var(--color-tanzanite)]");
  });

  it("renders a category badge and meta values", () => {
    const { getByText } = render(
      <NyuchiListingCard
        variant="compact"
        title="Tech Meetup"
        category="Technology"
        meta={[{ label: "date", value: "Jul 20" }, { label: "venue", value: "Harare" }]}
      />,
    );
    expect(getByText("Technology")).toBeTruthy();
    expect(getByText("Jul 20")).toBeTruthy();
    expect(getByText("Harare")).toBeTruthy();
  });

  it("labels a zero price as Free on the row variant", () => {
    const { getByText } = render(<NyuchiListingCard variant="row" title="Free Event" price={0} />);
    expect(getByText("Free")).toBeTruthy();
  });

  it("fires onClick when no href is supplied", () => {
    let clicked = false;
    render(<NyuchiListingCard variant="row" title="Clickable" onClick={() => (clicked = true)} />);
    fireEvent.click(card()!);
    expect(clicked).toBe(true);
  });

  it("renders a variant-proportioned skeleton while loading", () => {
    render(<NyuchiListingCard variant="hero" title="Loading" loading />);
    const el = card();
    expect(el?.hasAttribute("data-loading")).toBe(true);
    expect(el?.getAttribute("aria-busy")).toBe("true");
    expect(el?.className).toContain("animate-pulse");
  });
});
