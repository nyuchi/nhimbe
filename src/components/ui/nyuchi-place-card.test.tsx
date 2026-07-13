import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, fireEvent } from "@testing-library/react";
import { NyuchiPlaceCard } from "./nyuchi-place-card";

afterEach(() => {
  cleanup();
  Object.defineProperty(window, "matchMedia", { writable: true, configurable: true, value: undefined });
});

function card() {
  return document.querySelector('[data-slot="nyuchi-place-card"]');
}

describe("NyuchiPlaceCard", () => {
  it("renders a row with a mineral left-border accent and links via href", () => {
    render(<NyuchiPlaceCard name="Harare Gardens" mineral="malachite" address="Central" href="/places/1" />);
    const el = card();
    expect(el?.tagName).toBe("A");
    expect(el?.getAttribute("href")).toBe("/places/1");
    expect(el?.getAttribute("data-variant")).toBe("row");
    expect(el?.getAttribute("data-mineral")).toBe("malachite");
    expect((el as HTMLElement).style.borderLeftColor).toContain("--color-malachite");
  });

  it("shows rating and open/closed state", () => {
    const { getByText } = render(<NyuchiPlaceCard name="Cafe" rating={4.6} reviewCount={20} openNow variant="compact" />);
    expect(card()?.getAttribute("data-variant")).toBe("compact");
    expect(getByText("4.6")).toBeTruthy();
    expect(getByText("Open")).toBeTruthy();
  });

  it("renders a verification dot for a verified tier", () => {
    render(<NyuchiPlaceCard name="Verified Venue" verificationTier="government" />);
    expect(document.querySelector('[aria-label="government verified"]')).toBeTruthy();
  });

  it("fires onClick and is focusable when interactive", () => {
    const onClick = vi.fn();
    render(<NyuchiPlaceCard name="Clickable" onClick={onClick} />);
    const el = card()!;
    expect(el.getAttribute("tabindex")).toBe("0");
    fireEvent.click(el);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("renders a loading skeleton", () => {
    render(<NyuchiPlaceCard name="x" loading />);
    expect(card()?.hasAttribute("data-loading")).toBe(true);
  });
});
