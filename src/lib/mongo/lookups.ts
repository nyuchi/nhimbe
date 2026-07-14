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

/** A category plus how many upcoming published events currently carry it. */
export interface CategoryWithCount extends Category {
  eventCount: number;
}

/**
 * Categories with live upcoming-event counts — powers the /discover
 * "browse by category" tile grid. Counts come from a single aggregation over
 * published upcoming events' tags (the same field `listEvents`' category
 * filter matches, so a tile's count agrees with its drill-down).
 */
export async function listCategoriesWithCounts(): Promise<CategoryWithCount[]> {
  const [categories, col] = await Promise.all([listCategories(), eventsCollection()]);
  const rows = await col
    .aggregate<{ _id: string; count: number }>([
      { $match: { status: { $in: PUBLISHED }, startDate: { $gte: new Date() } } },
      { $unwind: "$tags" },
      { $group: { _id: "$tags", count: { $sum: 1 } } },
    ])
    .toArray();
  const counts = new Map(rows.map((r) => [r._id, r.count]));
  return categories.map((c) => ({ ...c, eventCount: counts.get(c.id) ?? 0 }));
}

/** A city plus how many upcoming published events are happening there. */
export interface CityWithCount {
  addressLocality: string;
  addressCountry: string;
  eventCount: number;
}

/**
 * Cities with live upcoming-event counts, busiest first — powers the
 * /discover "explore by city" cards and the home landing city chips.
 */
export async function listCitiesWithCounts(limit = 12): Promise<CityWithCount[]> {
  const col = await eventsCollection();
  const rows = await col
    .aggregate<{ _id: { city: string | null; country: string | null }; count: number }>([
      { $match: { status: { $in: PUBLISHED }, startDate: { $gte: new Date() } } },
      {
        $group: {
          _id: {
            city: { $ifNull: ["$location.addressLocality", "$location.address.addressLocality"] },
            country: { $ifNull: ["$location.addressCountry", "$location.address.addressCountry"] },
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { count: -1 } },
      { $limit: limit * 2 },
    ])
    .toArray();
  return rows
    .filter((r) => typeof r._id.city === "string" && r._id.city.length > 0)
    .slice(0, limit)
    .map((r) => ({
      addressLocality: r._id.city as string,
      addressCountry: (r._id.country as string) ?? "",
      eventCount: r.count,
    }));
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
