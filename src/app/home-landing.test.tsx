/**
 * Public home landing tests (NYU-24 IA refresh).
 *
 * The logged-out home is a lean landing: serif hero, ONE primary CTA into
 * /discover, city entry chips, at most one featured event — never a feed.
 */

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { HomeLanding } from "./home-landing";
import type { Event } from "@/lib/api";

const featuredEvent: Event = {
  id: "e1",
  shortCode: "abc123",
  slug: "sunset-jazz",
  name: "Sunset Jazz at the Gallery",
  description: "An evening of jazz.",
  startDate: "2026-08-01T18:00:00.000Z",
  date: { day: "1", month: "Aug", time: "6:00 PM" } as Event["date"],
  location: { name: "National Gallery", addressLocality: "Harare" } as Event["location"],
  category: "music",
  keywords: [],
  attendeeCount: 42,
  organizer: { name: "Gallery Collective" } as Event["organizer"],
};

describe("HomeLanding", () => {
  it("renders the serif hero with one primary CTA into /discover", () => {
    render(<HomeLanding cities={[]} />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Find your people.");
    const cta = screen.getByRole("link", { name: /Explore gatherings/ });
    expect(cta).toHaveAttribute("href", "/discover");
  });

  it("renders city entry chips into the scoped /events timeline", () => {
    render(
      <HomeLanding
        cities={[
          { addressLocality: "Harare", eventCount: 23 },
          { addressLocality: "Bulawayo", eventCount: 4 },
        ]}
      />,
    );
    const chip = screen.getByRole("link", { name: /Harare/ });
    expect(chip).toHaveAttribute("href", "/events?city=Harare");
    expect(screen.getByRole("link", { name: /Bulawayo/ })).toHaveAttribute(
      "href",
      "/events?city=Bulawayo",
    );
  });

  it("shows at most one featured event as a teaser — no feed", () => {
    const { container } = render(<HomeLanding featuredEvent={featuredEvent} cities={[]} />);
    expect(screen.getByText("Sunset Jazz at the Gallery")).toBeInTheDocument();
    // The 4.2.0 timeline (date-railed feed) must NOT render on home.
    expect(container.querySelector('[data-slot="nyuchi-timeline"]')).toBeNull();
    expect(container.querySelector('[data-slot="nyuchi-timeline-row"]')).toBeNull();
    expect(container.querySelectorAll('a[href^="/events/e"]').length).toBe(1);
  });

  it("renders no event section when there is nothing to feature", () => {
    render(<HomeLanding featuredEvent={null} cities={[]} />);
    expect(screen.queryByText("Happening soon")).not.toBeInTheDocument();
  });
});
