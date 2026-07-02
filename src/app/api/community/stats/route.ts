import { NextResponse } from "next/server";
import { eventsCollection } from "@/lib/mongo/databases";

/**
 * GET /api/community/stats — lightweight community stats from MongoDB,
 * replacing the worker's Supabase-backed endpoint. Optional ?city= filter.
 * Returns the CommunityStats shape src/lib/api.ts expects.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const city = new URL(request.url).searchParams.get("city") ?? undefined;
  const empty = {
    addressLocality: city,
    totalEvents: 0,
    totalAttendees: 0,
    activeHosts: 0,
    trendingCategories: [] as unknown[],
    peakTime: "",
    popularVenues: [] as unknown[],
  };
  try {
    const col = await eventsCollection();
    const filter: Record<string, unknown> = { status: { $in: ["published", "live"] } };
    if (city) filter["location.address.addressLocality"] = city;
    const totalEvents = await col.countDocuments(filter);
    return NextResponse.json({ ...empty, totalEvents });
  } catch (err) {
    console.error("[mukoko] GET /api/community/stats failed", err);
    return NextResponse.json(empty, { status: 200 });
  }
}
