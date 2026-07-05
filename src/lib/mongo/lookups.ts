/**
 * Small shared discovery reads (categories, cities, community stats).
 *
 * These back both the same-origin `/api/*` route handlers (kept for any
 * external callers) and — more importantly — the SSR pages / server actions,
 * so client components can drop the `/api` round-trip and read MongoDB through
 * the server directly. Server-only.
 */

import "server-only";
import { eventsCollection, getCollection, DB } from "./databases";
import type { Category, CommunityStats } from "@/lib/api";

const PUBLISHED = ["published", "live"];

interface InterestCategoryDoc {
  slug: string;
  name: string;
  groupName?: string;
  sortOrder?: number;
  isActive?: boolean;
}

/** Interest categories from engagement.interestCategories. */
export async function listCategories(): Promise<Category[]> {
  const col = await getCollection<InterestCategoryDoc>(DB.engagement, "interestCategories");
  const docs = await col.find({ isActive: true }).sort({ sortOrder: 1, name: 1 }).toArray();
  return docs.map((d) => ({ id: d.slug, name: d.name, group: d.groupName ?? "Categories" }));
}

/** Distinct cities derived from published events' embedded location. */
export async function listCities(): Promise<{ addressLocality: string; addressCountry: string }[]> {
  const col = await eventsCollection();
  const docs = await col
    .find({ status: { $in: ["published", "live"] } })
    .project({ location: 1 })
    .limit(2000)
    .toArray();

  const byCity = new Map<string, { addressLocality: string; addressCountry: string }>();
  for (const d of docs) {
    const loc = ((d as { location?: Record<string, unknown> }).location ?? {}) as Record<string, unknown>;
    const addr = ((loc.address as Record<string, unknown>) ?? loc) as Record<string, unknown>;
    const city = (addr.addressLocality as string) ?? "";
    const country = (addr.addressCountry as string) ?? "";
    if (city && !byCity.has(city)) byCity.set(city, { addressLocality: city, addressCountry: country });
  }
  return [...byCity.values()];
}

/** Lightweight community stats, optionally scoped to a city. */
export async function getCommunityStats(city?: string): Promise<CommunityStats> {
  const empty: CommunityStats = {
    addressLocality: city,
    totalEvents: 0,
    totalAttendees: 0,
    activeHosts: 0,
    trendingCategories: [],
    peakTime: "",
    popularVenues: [],
  };
  const col = await eventsCollection();
  const filter: Record<string, unknown> = { status: { $in: PUBLISHED } };
  if (city) filter["location.address.addressLocality"] = city;
  const totalEvents = await col.countDocuments(filter);
  return { ...empty, totalEvents };
}
