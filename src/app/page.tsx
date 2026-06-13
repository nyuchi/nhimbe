import { HomeClient } from "./home-client";
import { listEvents } from "@/lib/mongo/events";
import type { Event, Category } from "@/lib/api";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "";

// Refresh the cached listing every 60s — matches the old fetch-level
// revalidate so the home page stays ISR-cached rather than hitting Mongo on
// every request.
export const revalidate = 60;

async function fetchInitialEvents(): Promise<Event[]> {
  try {
    // Direct Mongo read on the server — no HTTP hop. Degrades to an empty
    // list (client retries via /api/events) if the cluster is unreachable or
    // MONGODB_URI is absent (e.g. CI builds).
    const { events } = await listEvents({ limit: 50 });
    return events;
  } catch {
    return [];
  }
}

async function fetchInitialCategories(): Promise<Category[]> {
  try {
    if (!API_URL) return [];
    const res = await fetch(`${API_URL}/api/categories`, {
      next: { revalidate: 60 },
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data.categories || [];
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
