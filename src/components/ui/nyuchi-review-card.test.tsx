import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, fireEvent } from "@testing-library/react";
import { NyuchiReviewCard } from "./nyuchi-review-card";

afterEach(() => {
  cleanup();
  Object.defineProperty(window, "matchMedia", { writable: true, configurable: true, value: undefined });
});

function card() {
  return document.querySelector('[data-slot="nyuchi-review-card"]');
}

describe("NyuchiReviewCard", () => {
  it("renders reviewer, review text and star rating label", () => {
    const { getByText, getByLabelText } = render(
      <NyuchiReviewCard reviewer="Tapiwa" rating={4} text="Great gathering, well organised." date="2 days ago" />,
    );
    expect(getByText("Tapiwa")).toBeTruthy();
    expect(getByText("Great gathering, well organised.")).toBeTruthy();
    expect(getByLabelText("4 out of 5 stars")).toBeTruthy();
  });

  it("shows a mineral trust dot for a verified tier", () => {
    render(<NyuchiReviewCard reviewer="Rudo" rating={5} text="Loved it" verificationTier={3} />);
    expect(card()?.getAttribute("data-tier")).toBe("3");
    expect(document.querySelector('[aria-label="Government verified"]')).toBeTruthy();
  });

  it("fires onHelpful and reflects the marked state", () => {
    const onHelpful = vi.fn();
    const { getByRole } = render(
      <NyuchiReviewCard reviewer="Sipho" rating={5} text="Nice" helpfulCount={3} markedHelpful onHelpful={onHelpful} />,
    );
    const btn = getByRole("button", { pressed: true });
    fireEvent.click(btn);
    expect(onHelpful).toHaveBeenCalledOnce();
    expect(btn.textContent).toContain("(3)");
  });

  it("renders a loading skeleton", () => {
    render(<NyuchiReviewCard reviewer="x" rating={0} text="" loading />);
    expect(card()?.hasAttribute("data-loading")).toBe(true);
  });
});
