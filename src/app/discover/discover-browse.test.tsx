/**
 * /discover browse-surface tests (NYU-24 IA refresh + NYU-25 calendars).
 *
 * The page is a BROWSE surface: four sections (categories → circles →
 * calendars → cities), every card a link into a scoped drill-down. No feed,
 * no timeline.
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { DiscoverBrowse } from "./discover-browse";
import type { CategoryWithCount, CityWithCount } from "@/lib/mongo/lookups";
import type { FeaturedCircle } from "@/lib/mongo/circles";
import type { FeaturedCalendar } from "@/lib/mongo/calendars";

// The Featured-calendars CTA pulls in the create-calendar modal, whose server
// action modules (and the host-mode picker's) transitively import the
// `server-only`-guarded Mongo layer and WorkOS session helpers — stub those
// boundaries so this presentational test never loads them.
vi.mock("@/app/actions/calendars", () => ({
  createCalendarAction: vi.fn(),
  updateCalendarAction: vi.fn(),
  getMyCirclesAction: vi.fn(async () => []),
}));
vi.mock("@/app/actions/host-entities", () => ({
  getMyHostEntities: vi.fn(async () => []),
}));
// The CTA calls useAuth(), which throws outside an <AuthProvider> — this
// suite only exercises the server-rendered browse content, so stub a
// logged-out viewer (the CTA renders nothing, matching real behaviour).
vi.mock("@/components/auth/auth-context", () => ({
  useAuth: () => ({ user: null }),
}));

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

const calendars: FeaturedCalendar[] = [
  {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    slug: "harare-live-music-abc123",
    name: "Harare Live Music",
    description: "Every gig worth catching in the capital.",
    followerCount: 132,
    eventCount: 8,
    theme: "malachite",
  },
  {
    id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    slug: "founders-breakfasts-def456",
    name: "Founders Breakfasts",
    description: null,
    followerCount: 1,
    eventCount: 2,
    theme: null,
  },
];

const cities: CityWithCount[] = [
  { addressLocality: "Harare", addressCountry: "Zimbabwe", eventCount: 23 },
  { addressLocality: "Bulawayo", addressCountry: "Zimbabwe", eventCount: 1 },
];

function renderBrowse(
  overrides: Partial<React.ComponentProps<typeof DiscoverBrowse>> = {},
) {
  return render(
    <DiscoverBrowse
      categories={categories}
      circles={circles}
      calendars={calendars}
      cities={cities}
      {...overrides}
    />,
  );
}

describe("DiscoverBrowse", () => {
  it("renders the four browse sections", () => {
    renderBrowse();
    expect(screen.getByRole("heading", { name: "Discover" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Browse by category" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Featured circles" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Featured calendars" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Explore by city" })).toBeInTheDocument();
  });

  it("links category tiles into the /events drill-down with live counts", () => {
    renderBrowse();
    const tile = screen.getByRole("link", { name: /Tech & Innovation/ });
    expect(tile).toHaveAttribute("href", "/events?category=tech");
    expect(tile).toHaveTextContent("12 events");
    // Singular form (anchored — "Harare Live Music" is a calendar, not this tile)
    expect(screen.getByRole("link", { name: /^Music/ })).toHaveTextContent("1 event");
  });

  it("presents circles as communities with a circleType-appropriate join affordance", () => {
    renderBrowse();
    const publicRow = screen.getByRole("link", { name: /Harare Runners/ });
    expect(publicRow).toHaveAttribute("href", "/circles/11111111-1111-4111-8111-111111111111");
    expect(publicRow).toHaveTextContent("Join");
    expect(publicRow).toHaveTextContent("48 members");
    expect(screen.getByRole("link", { name: /Founders Table/ })).toHaveTextContent(
      "Request to join",
    );
    expect(screen.getByRole("link", { name: /City Arts Wire/ })).toHaveTextContent("Follow");
    // Circles are communities: circle rows count members, never followers,
    // and never mention calendars.
    expect(publicRow).not.toHaveTextContent(/calendar/i);
    expect(publicRow).not.toHaveTextContent(/follower/i);
  });

  it("presents calendars as followable event streams linking to their pages", () => {
    renderBrowse();
    const row = screen.getByRole("link", { name: /Harare Live Music/ });
    expect(row).toHaveAttribute("href", "/calendars/harare-live-music-abc123");
    expect(row).toHaveTextContent("132 followers");
    expect(row).toHaveTextContent("Follow");
    expect(row).toHaveTextContent("Every gig worth catching in the capital.");
    // Singular follower form; calendars count followers, never members.
    const single = screen.getByRole("link", { name: /Founders Breakfasts/ });
    expect(single).toHaveTextContent("1 follower");
    expect(single).not.toHaveTextContent(/member/i);
  });

  it("links city cards into the /events drill-down", () => {
    renderBrowse();
    const card = screen
      .getAllByRole("link")
      .find((a) => a.getAttribute("href") === "/events?city=Harare");
    expect(card).toBeDefined();
    expect(card).toHaveTextContent("Harare");
    expect(card).toHaveTextContent("23 upcoming events");
  });

  it("degrades each section to a friendly empty message", () => {
    renderBrowse({ categories: [], circles: [], calendars: [], cities: [] });
    expect(screen.getByText(/Categories are warming up/)).toBeInTheDocument();
    expect(screen.getByText(/No circles to feature yet/)).toBeInTheDocument();
    expect(screen.getByText(/No calendars to follow yet/)).toBeInTheDocument();
    expect(screen.getByText(/No cities with upcoming events yet/)).toBeInTheDocument();
  });
});
