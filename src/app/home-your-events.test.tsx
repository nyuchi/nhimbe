/**
 * Authenticated home ("Your events") tests — NYU-24 IA refresh.
 *
 * The signed-in home is the member's own calendar: an Upcoming/Past
 * segmented control over a timeline of their RSVPs + hosted gatherings,
 * with the branded empty state pointing at Discover / Host.
 */

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { HomeYourEvents } from "./home-your-events";
import type { Event } from "@/lib/api";
import type { MyEventsResult } from "@/app/actions/my-events";

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

const EMPTY: MyEventsResult = { attending: [], hosting: [], past: [] };

describe("HomeYourEvents", () => {
  it("shows the branded empty state pointing at Discover / Host", () => {
    render(<HomeYourEvents events={EMPTY} userFirstName="Rudo" />);
    expect(screen.getByRole("heading", { name: "Your events" })).toBeInTheDocument();
    expect(screen.getByText("Nothing on your calendar yet")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Discover gatherings" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Host a gathering" })).toBeInTheDocument();
  });

  it("renders the member's upcoming events on a timeline", () => {
    const events: MyEventsResult = {
      attending: [makeEvent({ id: "a1", name: "Poetry Night" })],
      hosting: [makeEvent({ id: "h1", name: "My Workshop" })],
      past: [],
    };
    const { container } = render(<HomeYourEvents events={events} />);
    expect(screen.getByText("Poetry Night")).toBeInTheDocument();
    expect(screen.getByText("My Workshop")).toBeInTheDocument();
    expect(container.querySelector('[data-slot="nyuchi-timeline"]')).not.toBeNull();
    // Hosted events deep-link to manage.
    const hostRow = screen.getByText("My Workshop").closest("a");
    expect(hostRow).toHaveAttribute("href", "/events/h1/manage");
  });

  it("offers an Upcoming/Past segmented control", () => {
    render(<HomeYourEvents events={EMPTY} />);
    expect(screen.getByRole("tab", { name: /Upcoming/ })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Past/ })).toBeInTheDocument();
  });
});
