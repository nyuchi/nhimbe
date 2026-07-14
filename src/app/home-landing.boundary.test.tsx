/**
 * RSC → client boundary regression test (issue #71).
 *
 * `home-landing.tsx` is a server component; `NyuchiListingCard` is a
 * `"use client"` component. React forbids passing functions across that
 * boundary — a Lucide icon is a `forwardRef` object carrying a `render`
 * function, so feeding `meta: [{ icon: MapPin }]` into the client card made
 * `npm run build` fail prerendering `/` ("Functions cannot be passed to
 * Client Components"). jsdom renders everything client-side and so cannot
 * observe the real serialization error; instead we capture the exact props
 * the landing hands the client card and assert none of them (deeply) is a
 * function — the invariant the boundary requires.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import { HomeLanding } from "./home-landing";
import type { Event } from "@/lib/api";

const captured: Record<string, unknown>[] = [];

// Stand in for the real client card and record every prop it receives.
vi.mock("@/components/ui/nyuchi-listing-card", () => ({
  NyuchiListingCard: (props: Record<string, unknown>) => {
    captured.push(props);
    return <div data-slot="nyuchi-listing-card" />;
  },
}));

/** Walk a value tree and return the path of the first function found. */
function findFunction(value: unknown, path: string): string | null {
  if (typeof value === "function") return path;
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const hit = findFunction(value[i], `${path}[${i}]`);
      if (hit) return hit;
    }
  } else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      const hit = findFunction(v, `${path}.${k}`);
      if (hit) return hit;
    }
  }
  return null;
}

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

describe("HomeLanding RSC → client boundary", () => {
  beforeEach(() => {
    captured.length = 0;
  });

  it("passes no function props into the client listing card (issue #71)", () => {
    render(<HomeLanding featuredEvent={featuredEvent} cities={[]} />);
    expect(captured).toHaveLength(1);
    const offender = findFunction(captured[0], "NyuchiListingCard");
    expect(offender).toBeNull();
  });
});
