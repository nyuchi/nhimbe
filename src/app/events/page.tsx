import type { Metadata } from "next";
import { EventsClient } from "./events-client";
import { listEvents } from "@/lib/mongo/events";
import { listCategories, listCities } from "@/lib/mongo/lookups";

interface EventsPageProps {
  searchParams: Promise<{ category?: string; city?: string }>;
}

/**
 * /events — the all-events DRILL-DOWN (NYU-24 IA): the date-railed
 * NyuchiTimeline over every published upcoming event, scopeable by
 * `?category=<slug>` and `?city=<addressLocality>`. /discover's category
 * tiles and city cards link here; /events is no longer a competing
 * top-level discovery surface in the nav (browse lives on /discover).
 */

export async function generateMetadata({ searchParams }: EventsPageProps): Promise<Metadata> {
  const { category, city } = await searchParams;
  const scope = [category, city].filter(Boolean).join(" · ");
  return {
    title: scope ? `${scope} — events` : "All Events",
    description: scope
      ? `Upcoming ${category ?? "community"} events${city ? ` in ${city}` : ""} on nhimbe.`
      : "Every upcoming community event on nhimbe — concerts, meetups, workshops, and more.",
  };
}

// True SSR: read MongoDB directly on the server (no HTTP round-trip, no external
// API). `EventsClient` hydrates from this initial data (pre-scoped by the URL)
// and only re-filters client-side / re-fetches via server actions afterwards.
export default async function EventsPage({ searchParams }: EventsPageProps) {
  const { category, city } = await searchParams;

  const [eventsResult, initialCategories, initialCities] = await Promise.all([
    listEvents({ limit: 100 }).catch(() => null),
    listCategories().catch(() => []),
    listCities().catch(() => []),
  ]);

  return (
    <EventsClient
      initialEvents={eventsResult?.events ?? []}
      initialCategories={initialCategories}
      initialCities={initialCities}
      initialCategory={category}
      initialCity={city}
    />
  );
}
