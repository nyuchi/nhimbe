import type { Metadata } from "next";
import { DiscoverBrowse } from "./discover-browse";
import {
  listCategoriesWithCounts,
  listCitiesWithCounts,
  type CategoryWithCount,
  type CityWithCount,
} from "@/lib/mongo/lookups";
import { listFeaturedCircles, type FeaturedCircle } from "@/lib/mongo/circles";

export const metadata: Metadata = {
  title: "Discover",
  description:
    "Browse community gatherings on nhimbe — by category, by circle, or by city. Find what brings your people together.",
};

// Browse data is shared and slow-moving — keep the page ISR-cached like the
// other public listings rather than hitting Mongo on every request.
export const revalidate = 60;

async function fetchCategories(): Promise<CategoryWithCount[]> {
  try {
    return await listCategoriesWithCounts();
  } catch {
    return [];
  }
}

async function fetchCircles(): Promise<FeaturedCircle[]> {
  try {
    return await listFeaturedCircles(6);
  } catch {
    return [];
  }
}

async function fetchCities(): Promise<CityWithCount[]> {
  try {
    return await listCitiesWithCounts(8);
  } catch {
    return [];
  }
}

/**
 * /discover — the browse surface of the NYU-24 IA: category tiles →
 * featured circles → cities. Not a feed; every card links into a scoped
 * drill-down (/events?category=…, /events?city=…, /circles/[id]) where the
 * timeline renders. True SSR: direct Mongo reads, no HTTP hop, each section
 * degrading independently to an empty list if the cluster is unreachable.
 */
export default async function DiscoverPage() {
  const [categories, circles, cities] = await Promise.all([
    fetchCategories(),
    fetchCircles(),
    fetchCities(),
  ]);

  return <DiscoverBrowse categories={categories} circles={circles} cities={cities} />;
}
