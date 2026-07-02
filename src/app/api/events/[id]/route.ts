/**
 * GET /api/events/:id — single event by `_id`, slug, or shortCode, backed by
 * MongoDB. Mirrors the worker's `{ event }` response shape (and 404 → the
 * client's `getEventById` swallows the error and returns null).
 *
 * Node runtime: the MongoDB driver requires Node, not edge.
 */

import { NextResponse } from "next/server";
import { getEventByIdOrSlug } from "@/lib/mongo/events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  try {
    const event = await getEventByIdOrSlug(id);
    if (!event) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }
    return NextResponse.json({ event });
  } catch (err) {
    console.error(`[mukoko] GET /api/events/${id} failed`, err);
    return NextResponse.json({ error: "Failed to load event" }, { status: 500 });
  }
}
