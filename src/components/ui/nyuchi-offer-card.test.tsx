import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, fireEvent } from "@testing-library/react";
import { NyuchiOfferCard } from "./nyuchi-offer-card";

afterEach(() => {
  cleanup();
  Object.defineProperty(window, "matchMedia", { writable: true, configurable: true, value: undefined });
});

function card() {
  return document.querySelector('[data-slot="nyuchi-offer-card"]');
}

describe("NyuchiOfferCard", () => {
  it("renders the formatted price and a discount badge", () => {
    const { getByText } = render(
      <NyuchiOfferCard title="Marimba" price={80} originalPrice={100} image="/x.jpg" sellerName="Kudzi" />,
    );
    expect(getByText("$80.00")).toBeTruthy();
    expect(getByText("$100.00")).toBeTruthy();
    expect(getByText("-20%")).toBeTruthy();
    expect(getByText("Kudzi")).toBeTruthy();
  });

  it("fires onInquire without triggering the card onClick", () => {
    const onInquire = vi.fn();
    const onClick = vi.fn();
    const { getByText } = render(
      <NyuchiOfferCard title="Item" price={10} onInquire={onInquire} onClick={onClick} />,
    );
    fireEvent.click(getByText("Inquire"));
    expect(onInquire).toHaveBeenCalledOnce();
    expect(onClick).not.toHaveBeenCalled();
  });

  it("renders a loading skeleton", () => {
    render(<NyuchiOfferCard title="x" price={0} loading />);
    expect(card()?.hasAttribute("data-loading")).toBe(true);
  });
});
