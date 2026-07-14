/**
 * /calendars/[slug] page tests (NYU-25): SSR render of the calendar view
 * (header identity, follow pill, timeline, circle provenance), the
 * private-404 gate, and metadata (private never leaks, unlisted noindexed).
 *
 * The async RSC is invoked directly with mocked data readers — no cluster,
 * no session; the client leaves (FollowButton, NyuchiTimeline) render under
 * jsdom inside the I18nProvider.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { I18nProvider } from "@/lib/i18n/i18n-provider";
import type { CalendarDoc } from "@/lib/mongo/types";
import type { Event } from "@/lib/api";

vi.mock("server-only", () => ({}));

// notFound must throw (like Next's real one) so the page short-circuits.
const NOT_FOUND = new Error("NEXT_NOT_FOUND");
vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw NOT_FOUND;
  }),
}));

// Data readers — the page only ever touches these mocks.
const getCalendarBySlug = vi.fn();
const listCalendarEvents = vi.fn();
const isFollowingCalendar = vi.fn();
vi.mock("@/lib/mongo/calendars", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/mongo/calendars")>();
  return {
    ...actual, // keeps the REAL canViewCalendar gate in play
    getCalendarBySlug: (...args: unknown[]) => getCalendarBySlug(...args),
    listCalendarEvents: (...args: unknown[]) => listCalendarEvents(...args),
    isFollowingCalendar: (...args: unknown[]) => isFollowingCalendar(...args),
  };
});
// The actual calendars module pulls the driver layer — stub it out.
vi.mock("@/lib/mongo/databases", () => ({
  calendarsCollection: vi.fn(),
  calendarFollowsCollection: vi.fn(),
  eventsCollection: vi.fn(),
}));
vi.mock("@/lib/mongo/events", () => ({ listEvents: vi.fn() }));

const getEntityById = vi.fn();
vi.mock("@/lib/mongo/entities", () => ({
  getEntityById: (...args: unknown[]) => getEntityById(...args),
}));

const getCircleSummary = vi.fn();
vi.mock("@/lib/mongo/circles", () => ({
  getCircleSummary: (...args: unknown[]) => getCircleSummary(...args),
}));

const resolveActingPerson = vi.fn();
vi.mock("@/lib/auth/current-person", () => ({
  resolveActingPerson: (...args: unknown[]) => resolveActingPerson(...args),
}));

import CalendarPage, { generateMetadata } from "./page";

const baseCalendar: CalendarDoc = {
  _id: "cal-1",
  _schemaVersion: "v3.1",
  slug: "harare-live-music-abc123",
  name: "Harare Live Music",
  schemaOrgType: "EventSeries",
  ownerPersonId: "owner-1",
  ownerEntityId: "entity-1",
  visibility: "public",
  isActive: true,
  followerCount: 42,
  eventCount: 3,
  iCalUid: "cal-1@nhimbe.com",
  surfaceContext: "nhimbe",
  description: "Every gig worth catching.",
  circleId: "circle-1",
  theme: "malachite",
  createdAt: new Date("2026-01-01T00:00:00Z"),
  updatedAt: new Date("2026-07-01T00:00:00Z"),
};

const timelineEvent = {
  id: "event-1",
  name: "Jam Session",
  startDate: "2026-08-01T18:00:00.000Z",
  date: { time: "6:00 PM" },
  location: { name: "Studio 7", addressLocality: "Harare" },
  organizer: { name: "Studio Collective" },
  attendeeCount: 12,
  category: "music",
} as unknown as Event;

function pageProps(slug = baseCalendar.slug) {
  return { params: Promise.resolve({ slug }) };
}

async function renderPage(slug?: string) {
  const ui = await CalendarPage(pageProps(slug));
  return render(<I18nProvider>{ui}</I18nProvider>);
}

beforeEach(() => {
  vi.clearAllMocks();
  getCalendarBySlug.mockResolvedValue(baseCalendar);
  listCalendarEvents.mockResolvedValue([timelineEvent]);
  isFollowingCalendar.mockResolvedValue(false);
  getEntityById.mockResolvedValue({ _id: "entity-1", name: "Studio Collective" });
  getCircleSummary.mockResolvedValue({ id: "circle-1", name: "Harare Musicians" });
  resolveActingPerson.mockResolvedValue(null);
});

afterEach(() => {
  cleanup();
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: undefined,
  });
});

describe("CalendarPage (SSR render)", () => {
  it("renders name, description, curator, counts and the event timeline", async () => {
    await renderPage();

    expect(screen.getByRole("heading", { name: "Harare Live Music" })).toBeInTheDocument();
    expect(screen.getByText("Every gig worth catching.")).toBeInTheDocument();
    expect(screen.getByText(/Curated by Studio Collective/)).toBeInTheDocument();
    expect(screen.getByText(/42 followers/)).toBeInTheDocument();
    expect(screen.getByText(/3 events/)).toBeInTheDocument();
    // The stream itself — the timeline drill-down.
    expect(document.querySelector('[data-slot="nyuchi-timeline"]')).toBeTruthy();
    expect(screen.getByText("Jam Session")).toBeInTheDocument();
  });

  it("grounds the page in the calendar's washed theme", async () => {
    await renderPage();
    const themed = document.querySelector("[data-event-theme]");
    expect(themed?.getAttribute("data-event-theme")).toBe("malachite");
  });

  it("shows the 'from <circle>' provenance link without conflating stream and community", async () => {
    await renderPage();
    const circleLink = screen.getByRole("link", { name: "Harare Musicians" });
    expect(circleLink).toHaveAttribute("href", "/circles/circle-1");
  });

  it("offers logged-out visitors a sign-in-to-follow link with return_to, plus the .ics feed", async () => {
    await renderPage();
    const signIn = screen.getByRole("link", { name: /Sign in to follow/ });
    expect(signIn).toHaveAttribute(
      "href",
      `/auth/hosted?return_to=${encodeURIComponent("/calendars/harare-live-music-abc123")}`,
    );
    const ics = screen.getByRole("link", { name: /Subscribe \(\.ics\)/ });
    expect(ics).toHaveAttribute("href", "/calendars/harare-live-music-abc123/ics");
  });

  it("shows the Follow pill (not the sign-in link) to a signed-in viewer", async () => {
    resolveActingPerson.mockResolvedValue({ _id: "person-9" });
    await renderPage();
    expect(screen.getByRole("button", { name: /Follow/ })).toBeInTheDocument();
    expect(screen.queryByText(/Sign in to follow/)).not.toBeInTheDocument();
  });

  it("degrades to a friendly empty state when the calendar has no upcoming events", async () => {
    listCalendarEvents.mockResolvedValue([]);
    await renderPage();
    expect(screen.getByText(/No upcoming events on this calendar yet/)).toBeInTheDocument();
  });

  it("404s for an unknown slug", async () => {
    getCalendarBySlug.mockResolvedValue(null);
    await expect(CalendarPage(pageProps("nope"))).rejects.toThrow("NEXT_NOT_FOUND");
  });
});

describe("CalendarPage (private-404 gate)", () => {
  const privateCalendar = { ...baseCalendar, visibility: "private" as const };

  it("404s a private calendar for anonymous visitors", async () => {
    getCalendarBySlug.mockResolvedValue(privateCalendar);
    resolveActingPerson.mockResolvedValue(null);
    await expect(CalendarPage(pageProps())).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("404s a private calendar for a signed-in non-owner", async () => {
    getCalendarBySlug.mockResolvedValue(privateCalendar);
    resolveActingPerson.mockResolvedValue({ _id: "someone-else" });
    await expect(CalendarPage(pageProps())).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("renders a private calendar for its owner", async () => {
    getCalendarBySlug.mockResolvedValue(privateCalendar);
    resolveActingPerson.mockResolvedValue({ _id: "owner-1" });
    await renderPage();
    expect(screen.getByRole("heading", { name: "Harare Live Music" })).toBeInTheDocument();
    expect(screen.getByText("Private")).toBeInTheDocument();
  });
});

describe("generateMetadata", () => {
  it("emits title/description/canonical for a public calendar", async () => {
    const metadata = await generateMetadata(pageProps());
    expect(metadata.title).toBe("Harare Live Music - nhimbe");
    expect(metadata.description).toBe("Every gig worth catching.");
    expect(metadata.alternates?.canonical).toBe(
      "https://nhimbe.com/calendars/harare-live-music-abc123",
    );
    expect(metadata.robots).toBeUndefined();
  });

  it("noindexes unlisted calendars but still names them", async () => {
    getCalendarBySlug.mockResolvedValue({ ...baseCalendar, visibility: "unlisted" });
    const metadata = await generateMetadata(pageProps());
    expect(metadata.title).toBe("Harare Live Music - nhimbe");
    expect(metadata.robots).toEqual({ index: false });
  });

  it("never leaks a private calendar's name through metadata", async () => {
    getCalendarBySlug.mockResolvedValue({ ...baseCalendar, visibility: "private" });
    const metadata = await generateMetadata(pageProps());
    expect(metadata.title).toBe("Calendar not found - nhimbe");
    expect(JSON.stringify(metadata)).not.toContain("Harare Live Music");
  });
});
