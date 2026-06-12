/**
 * GET /api/events — public event listing, backed directly by MongoDB.
 *
 * This is the Vercel-native replacement for the Cloudflare Worker's
 * `/api/events` route. It returns the same `{ events, pagination }` shape the
 * existing `src/lib/api.ts` client expects, so the frontend flips over by
 * pointing `NEXT_PUBLIC_API_URL` at this app's own origin — no UI changes.
 *
 * Node runtime + dynamic: the MongoDB driver requires Node (not edge), and
 * these are live reads that must not be statically cached.
 */

import { NextResponse } from "next/server";
import { listEvents } from "@/lib/mongo/events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  const limitRaw = searchParams.get("limit");
  const offsetRaw = searchParams.get("offset");

  try {
    const { events, total, limit, offset } = await listEvents({
      city: searchParams.get("city") ?? undefined,
      category: searchParams.get("category") ?? undefined,
      limit: limitRaw ? Number.parseInt(limitRaw, 10) : undefined,
      offset: offsetRaw ? Number.parseInt(offsetRaw, 10) : undefined,
    });

    return NextResponse.json({ events, pagination: { limit, offset, total } });
  } catch (err) {
    console.error("[mukoko] GET /api/events failed", err);
    return NextResponse.json({ error: "Failed to load events" }, { status: 500 });
  }
}
