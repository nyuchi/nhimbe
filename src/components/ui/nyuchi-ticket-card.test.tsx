import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, fireEvent } from "@testing-library/react";
import { NyuchiTicketCard } from "./nyuchi-ticket-card";

afterEach(() => {
  cleanup();
  Object.defineProperty(window, "matchMedia", { writable: true, configurable: true, value: undefined });
});

function ticket() {
  return document.querySelector('[data-slot="nyuchi-ticket-card"]');
}

describe("NyuchiTicketCard", () => {
  it("renders event details, tier, and a valid status", () => {
    const { getByText } = render(
      <NyuchiTicketCard eventTitle="Jazz Night" eventDate="Jul 20" eventVenue="The Venue" tierName="VIP" ticketCode="ABC123" />,
    );
    expect(getByText("Jazz Night")).toBeTruthy();
    expect(getByText("Jul 20")).toBeTruthy();
    expect(getByText("The Venue")).toBeTruthy();
    expect(getByText("VIP")).toBeTruthy();
    expect(getByText("ABC123")).toBeTruthy();
    expect(getByText("Valid")).toBeTruthy();
    expect(ticket()?.getAttribute("data-status")).toBe("valid");
  });

  it("reflects the cancelled status", () => {
    const { getByText } = render(<NyuchiTicketCard eventTitle="X" eventDate="Y" status="cancelled" />);
    expect(getByText("Cancelled")).toBeTruthy();
    expect(ticket()?.getAttribute("data-status")).toBe("cancelled");
  });

  it("links via href when provided", () => {
    render(<NyuchiTicketCard eventTitle="X" eventDate="Y" href="/events/1" />);
    expect(ticket()?.tagName).toBe("A");
    expect(ticket()?.getAttribute("href")).toBe("/events/1");
  });

  it("calls onTap when tapped", () => {
    const onTap = vi.fn();
    render(<NyuchiTicketCard eventTitle="X" eventDate="Y" onTap={onTap} />);
    fireEvent.click(ticket()!);
    expect(onTap).toHaveBeenCalledOnce();
  });

  it("renders a loading skeleton", () => {
    render(<NyuchiTicketCard eventTitle="X" eventDate="Y" loading />);
    expect(ticket()?.hasAttribute("data-loading")).toBe(true);
    expect(ticket()?.className).toContain("animate-pulse");
  });
});
