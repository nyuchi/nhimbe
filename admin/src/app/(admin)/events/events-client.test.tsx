/**
 * Events client — table render, featured flag, and lifecycle badge display.
 * The mutations are admin-gated server actions (mocked out here).
 */

import { describe, it, expect, vi, type Mock } from "vitest";
import { render, screen } from "@testing-library/react";
import type { AdminEvent } from "@/lib/mongo/admin-types";

vi.mock("@admin/app/actions/admin", () => ({
  fetchAdminEvents: vi.fn(),
  publishEvent: vi.fn(),
  cancelEvent: vi.fn(),
  archiveEvent: vi.fn(),
  setEventFeatured: vi.fn(),
}));

import { fetchAdminEvents } from "@admin/app/actions/admin";
import EventsClient from "./events-client";

/** Echo the SSR page back for the component's mount re-fetch. */
function primeFetch(events: AdminEvent[]) {
  (fetchAdminEvents as Mock).mockResolvedValue({ events, total: events.length });
}

function event(overrides: Partial<AdminEvent> = {}): AdminEvent {
  return {
    id: "evt-1",
    name: "Mbira Night",
    description: "An evening of mbira",
    date: { full: "Sat, Aug 1" },
    startDate: "2026-08-01T18:00:00.000Z",
    location: { name: "Harare Gardens", addressLocality: "Harare" },
    category: "Music",
    attendeeCount: 42,
    maximumAttendeeCapacity: 100,
    organizer: { name: "Mukoko Collective" },
    status: "upcoming",
    lifecycleStatus: "published",
    featured: false,
    dateCreated: "2026-07-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("EventsClient", () => {
  it("renders event rows with derived status and capacity", async () => {
    primeFetch([event()]);
    render(<EventsClient initialEvents={[event()]} initialTotal={1} />);

    expect(await screen.findByText("Mbira Night")).toBeInTheDocument();
    expect(screen.getByText("upcoming")).toBeInTheDocument();
    expect(screen.getByText("42/100")).toBeInTheDocument();
    expect(screen.getByText("Mukoko Collective")).toBeInTheDocument();
  });

  it("marks featured events and surfaces draft lifecycle status", async () => {
    const draft = event({
      id: "evt-2",
      name: "Draft Gala",
      featured: true,
      lifecycleStatus: "draft",
    });
    primeFetch([draft]);
    render(<EventsClient initialEvents={[draft]} initialTotal={1} />);

    expect(await screen.findByLabelText("Featured")).toBeInTheDocument();
    expect(screen.getByText("draft")).toBeInTheDocument();
  });

  it("shows the empty state without events (no-Mongo SSR fallback)", async () => {
    primeFetch([]);
    render(<EventsClient initialEvents={[]} initialTotal={0} />);
    expect(await screen.findByText("No events found")).toBeInTheDocument();
  });
});
