import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, fireEvent } from "@testing-library/react";
import { NyuchiRSVPButton } from "./nyuchi-rsvp-button";

afterEach(() => {
  cleanup();
  Object.defineProperty(window, "matchMedia", { writable: true, configurable: true, value: undefined });
});

describe("NyuchiRSVPButton", () => {
  it("renders the free idle label", () => {
    const { getByRole } = render(<NyuchiRSVPButton status="none" price={0} />);
    expect(getByRole("button").textContent).toContain("RSVP — Free");
  });

  it("renders a priced idle label", () => {
    const { getByRole } = render(<NyuchiRSVPButton status="none" price={25} />);
    expect(getByRole("button").textContent).toContain("Get Tickets");
    expect(getByRole("button").textContent).toContain("25");
  });

  it("shows the confirmed state label", () => {
    const { getByRole } = render(<NyuchiRSVPButton status="confirmed" />);
    expect(getByRole("button").textContent).toContain("Confirmed");
  });

  it("calls onRSVP when idle and onCancel when actioned", () => {
    const onRSVP = vi.fn();
    const { getByRole, rerender } = render(<NyuchiRSVPButton status="none" onRSVP={onRSVP} />);
    fireEvent.click(getByRole("button"));
    expect(onRSVP).toHaveBeenCalledOnce();

    const onCancel = vi.fn();
    rerender(<NyuchiRSVPButton status="confirmed" onCancel={onCancel} />);
    fireEvent.click(getByRole("button"));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("disables and spins while loading", () => {
    const { getByRole } = render(<NyuchiRSVPButton status="none" loading />);
    const btn = getByRole("button") as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    expect(btn.textContent).toContain("Processing");
    expect(btn.querySelector("svg")?.getAttribute("class")).toContain("animate-spin");
  });

  it("surfaces remaining spots on the idle state", () => {
    const { getByText } = render(<NyuchiRSVPButton status="none" spotsRemaining={7} />);
    expect(getByText("7 spots remaining")).toBeTruthy();
  });
});
