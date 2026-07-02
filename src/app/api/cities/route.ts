import { NextResponse } from "next/server";
import { eventsCollection } from "@/lib/mongo/databases";

/**
 * GET /api/cities — distinct cities derived from published events (the same
 * approach the retired worker used). Empty until events exist; the create form
 * also carries a static fallback.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
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
    return NextResponse.json({ cities: [...byCity.values()] });
  } catch (err) {
    console.error("[mukoko] GET /api/cities failed", err);
    return NextResponse.json({ cities: [] }, { status: 200 });
  }
}
