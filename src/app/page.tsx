import { HomeClient } from "./home-client";
import { listEvents } from "@/lib/mongo/events";
import { listCategories } from "@/lib/mongo/lookups";
import type { Event, Category } from "@/lib/api";

// Refresh the cached listing every 60s — matches the old fetch-level
// revalidate so the home page stays ISR-cached rather than hitting Mongo on
// every request.
export const revalidate = 60;

async function fetchInitialEvents(): Promise<Event[]> {
  try {
    // Direct Mongo read on the server — no HTTP hop. Degrades to an empty
    // list (client retries via a server action) if the cluster is unreachable
    // or MONGODB_URI is absent (e.g. CI builds).
    const { events } = await listEvents({ limit: 50 });
    return events;
  } catch {
    return [];
  }
}

async function fetchInitialCategories(): Promise<Category[]> {
  try {
    // Direct Mongo read on the server — no HTTP hop to /api or any external API.
    return await listCategories();
  } catch {
    return [];
  }
}

export default async function DiscoverPage() {
  const [initialEvents, initialCategories] = await Promise.all([
    fetchInitialEvents(),
    fetchInitialCategories(),
  ]);

  return (
    <HomeClient
      initialEvents={initialEvents}
      initialCategories={initialCategories}
    />
  );
}
