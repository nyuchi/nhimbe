import type { Metadata } from "next";
import { EventsClient } from "./events-client";
import { listEvents } from "@/lib/mongo/events";
import { listCategories, listCities } from "@/lib/mongo/lookups";

export const metadata: Metadata = {
  title: "Browse Events",
  description: "Discover community events near you — concerts, meetups, workshops, and more on nhimbe.",
};

// True SSR: read MongoDB directly on the server (no HTTP round-trip, no external
// API). Re-rendered at most every 60s. `EventsClient` hydrates from this initial
// data and only re-fetches (via server actions) when the user changes filters.
export const revalidate = 60;

export default async function EventsPage() {
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
    />
  );
}
