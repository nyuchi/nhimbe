/**
 * /discover browse-surface tests (NYU-24 IA refresh).
 *
 * The page is a BROWSE surface: three sections (categories → circles →
 * cities), every card a link into a scoped drill-down. No feed, no timeline.
 */

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { DiscoverBrowse } from "./discover-browse";
import type { CategoryWithCount, CityWithCount } from "@/lib/mongo/lookups";
import type { FeaturedCircle } from "@/lib/mongo/circles";

const categories: CategoryWithCount[] = [
  { id: "tech", name: "Tech & Innovation", group: "Categories", eventCount: 12 },
  { id: "music", name: "Music", group: "Categories", eventCount: 1 },
];

const circles: FeaturedCircle[] = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    name: "Harare Runners",
    description: "Weekly park runs and trail meets.",
    circleType: "public",
    memberCount: 48,
    postCount: 12,
  },
  {
    id: "22222222-2222-4222-8222-222222222222",
    name: "Founders Table",
    description: "Invite-first founder dinners.",
    circleType: "private",
    memberCount: 9,
    postCount: 3,
  },
  {
    id: "33333333-3333-4333-8333-333333333333",
    name: "City Arts Wire",
    description: "Announcements from the arts collective.",
    circleType: "broadcast",
    memberCount: 200,
    postCount: 40,
  },
];

const cities: CityWithCount[] = [
  { addressLocality: "Harare", addressCountry: "Zimbabwe", eventCount: 23 },
  { addressLocality: "Bulawayo", addressCountry: "Zimbabwe", eventCount: 1 },
];

describe("DiscoverBrowse", () => {
  it("renders the three browse sections", () => {
    render(<DiscoverBrowse categories={categories} circles={circles} cities={cities} />);
    expect(screen.getByRole("heading", { name: "Discover" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Browse by category" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Featured circles" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Explore by city" })).toBeInTheDocument();
  });

  it("links category tiles into the /events drill-down with live counts", () => {
    render(<DiscoverBrowse categories={categories} circles={circles} cities={cities} />);
    const tile = screen.getByRole("link", { name: /Tech & Innovation/ });
    expect(tile).toHaveAttribute("href", "/events?category=tech");
    expect(tile).toHaveTextContent("12 events");
    // Singular form
    expect(screen.getByRole("link", { name: /Music/ })).toHaveTextContent("1 event");
  });

  it("presents circles as communities with a circleType-appropriate join affordance", () => {
    render(<DiscoverBrowse categories={categories} circles={circles} cities={cities} />);
    const publicRow = screen.getByRole("link", { name: /Harare Runners/ });
    expect(publicRow).toHaveAttribute("href", "/circles/11111111-1111-4111-8111-111111111111");
    expect(publicRow).toHaveTextContent("Join");
    expect(publicRow).toHaveTextContent("48 members");
    expect(screen.getByRole("link", { name: /Founders Table/ })).toHaveTextContent(
      "Request to join",
    );
    expect(screen.getByRole("link", { name: /City Arts Wire/ })).toHaveTextContent("Follow");
    // Circles are communities, never calendars.
    expect(screen.queryByText(/calendar/i)).not.toBeInTheDocument();
  });

  it("links city cards into the /events drill-down", () => {
    render(<DiscoverBrowse categories={categories} circles={circles} cities={cities} />);
    const card = screen
      .getAllByRole("link")
      .find((a) => a.getAttribute("href") === "/events?city=Harare");
    expect(card).toBeDefined();
    expect(card).toHaveTextContent("Harare");
    expect(card).toHaveTextContent("23 upcoming events");
  });

  it("degrades each section to a friendly empty message", () => {
    render(<DiscoverBrowse categories={[]} circles={[]} cities={[]} />);
    expect(screen.getByText(/Categories are warming up/)).toBeInTheDocument();
    expect(screen.getByText(/No circles to feature yet/)).toBeInTheDocument();
    expect(screen.getByText(/No cities with upcoming events yet/)).toBeInTheDocument();
  });
});
