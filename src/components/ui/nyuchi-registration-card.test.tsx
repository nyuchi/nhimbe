import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, fireEvent } from "@testing-library/react";
import { NyuchiRegistrationCard, type RegistrationTier } from "./nyuchi-registration-card";

afterEach(() => {
  cleanup();
  Object.defineProperty(window, "matchMedia", { writable: true, configurable: true, value: undefined });
});

const tiers: RegistrationTier[] = [
  { id: "general", name: "General", price: 0 },
  { id: "vip", name: "VIP", price: 25 },
];

describe("NyuchiRegistrationCard", () => {
  it("renders tiers with radio semantics and formatted prices", () => {
    const { getByText, getByRole } = render(<NyuchiRegistrationCard tiers={tiers} />);
    expect(document.querySelector('[data-slot="nyuchi-registration-card"]')).toBeTruthy();
    expect(getByRole("radiogroup", { name: "Ticket tiers" })).toBeTruthy();
    expect(getByText("General")).toBeTruthy();
    expect(getByText("VIP")).toBeTruthy();
    expect(getByText("Free")).toBeTruthy();
    expect(getByText("$25.00")).toBeTruthy();
  });

  it("increments quantity when the + control is clicked", () => {
    const { getByLabelText, getByText } = render(<NyuchiRegistrationCard tiers={tiers} min={1} max={5} />);
    expect(getByText("1")).toBeTruthy();
    fireEvent.click(getByLabelText("Increase quantity"));
    expect(getByText("2")).toBeTruthy();
  });

  it("selects a tier and submits the chosen tier + quantity", () => {
    let payload: { tierId: string | null; quantity: number } | null = null;
    const { getByRole, getByText } = render(
      <NyuchiRegistrationCard tiers={tiers} onSubmit={(p) => (payload = p)} />,
    );
    fireEvent.click(getByRole("radio", { name: /VIP/ }));
    fireEvent.click(getByText(/Register/));
    expect(payload).toEqual({ tierId: "vip", quantity: 1 });
  });
});
