/**
 * Hosting tab multi-view (NYU manage-events request) — Card/Table/Timeline
 * view-switcher for the host's own events.
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { HostingView } from "./hosting-view";
import type { Event } from "@/lib/api";

function makeEvent(overrides: Partial<Event>): Event {
  return {
    id: "e1",
    shortCode: "abc123",
    slug: "slug",
    name: "Event",
    description: "",
    startDate: "2027-01-01T10:00:00.000Z",
    date: { day: "1", month: "Jan", time: "10:00 AM" } as Event["date"],
    location: { name: "Venue", addressLocality: "Harare" } as Event["location"],
    category: "tech",
    keywords: [],
    attendeeCount: 3,
    organizer: { name: "Host Org" } as Event["organizer"],
    ...overrides,
  };
}

describe("HostingView", () => {
  it("renders nothing for an empty event list (caller shows the empty state)", () => {
    const { container } = render(<HostingView events={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("defaults to the Card view", () => {
    const events = [makeEvent({ id: "h1", name: "My Workshop" })];
    render(<HostingView events={events} />);
    expect(screen.getByText("My Workshop")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Card" })).toHaveAttribute("aria-pressed", "true");
  });

  it("switches to the Table view with sortable columns", () => {
    const events = [
      makeEvent({ id: "h1", name: "Zebra Meetup", attendeeCount: 1, startDate: "2027-02-01T10:00:00.000Z" }),
      makeEvent({ id: "h2", name: "Apple Social", attendeeCount: 9, startDate: "2027-01-01T10:00:00.000Z" }),
    ];
    render(<HostingView events={events} />);

    fireEvent.click(screen.getByRole("button", { name: "Table" }));
    expect(screen.getByRole("table")).toBeInTheDocument();
    // Sorted by date ascending by default — Apple Social (Jan) before Zebra Meetup (Feb).
    const rows = screen.getAllByRole("row").slice(1); // drop header row
    expect(rows[0]).toHaveTextContent("Apple Social");
    expect(rows[1]).toHaveTextContent("Zebra Meetup");

    // Sorting by name toggles the order.
    fireEvent.click(screen.getByRole("button", { name: /^Event/ }));
    const sortedRows = screen.getAllByRole("row").slice(1);
    expect(sortedRows[0]).toHaveTextContent("Apple Social");
  });

  it("switches to the Timeline view", () => {
    const events = [makeEvent({ id: "h1", name: "My Workshop" })];
    const { container } = render(<HostingView events={events} />);

    fireEvent.click(screen.getByRole("button", { name: "Timeline" }));
    expect(container.querySelector('[data-slot="nyuchi-timeline"]')).not.toBeNull();
    expect(screen.getByText("My Workshop")).toBeInTheDocument();
  });

  it("persists the chosen view to localStorage", () => {
    const events = [makeEvent({ id: "h1", name: "My Workshop" })];
    render(<HostingView events={events} />);
    fireEvent.click(screen.getByRole("button", { name: "Table" }));
    expect(window.localStorage.setItem).toHaveBeenCalledWith("nhimbe:my-events:hosting-view", "table");
  });

  it("restores a previously stored view on mount", () => {
    (window.localStorage.getItem as ReturnType<typeof vi.fn>).mockReturnValue("timeline");
    const events = [makeEvent({ id: "h1", name: "My Workshop" })];
    const { container } = render(<HostingView events={events} />);
    expect(container.querySelector('[data-slot="nyuchi-timeline"]')).not.toBeNull();
    expect(screen.getByRole("button", { name: "Timeline" })).toHaveAttribute("aria-pressed", "true");
  });
});
