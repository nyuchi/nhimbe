/**
 * GET /api/events/:id/analytics — attendance analytics for a hosted event.
 *
 * Bearer-authed HOST endpoint for the Mukoko Events MCP's `event_analytics`
 * tool. Auth is a WorkOS access token resolved to the acting person, who must
 * host the event (the same entity-centric gate as the registration/blast
 * endpoints). Merges the operational counters (`getEventStats`) with the
 * derived check-in figures (`getCheckinStats`) into one `{ analytics }` shape.
 *
 * Node runtime + dynamic: live Mongo reads that must not be statically cached.
 */

import { NextResponse } from "next/server";
import { requireBearerEventHost, ActorError } from "@/lib/auth/mcp-host";
import { getEventStats } from "@/lib/mongo/stats";
import { getCheckinStats } from "@/lib/mongo/host-registrations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  let ctx;
  try {
    ctx = await requireBearerEventHost(request.headers.get("Authorization"), id);
  } catch (err) {
    if (err instanceof ActorError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }

  try {
    const eventId = ctx.event._id;
    const [stats, checkin] = await Promise.all([getEventStats(eventId), getCheckinStats(eventId)]);
    return NextResponse.json({
      analytics: {
        eventId,
        views: stats.views,
        uniqueViews: stats.uniqueViews,
        rsvps: stats.rsvps,
        checkins: stats.checkins,
        referrals: stats.referrals,
        remaining: checkin.remaining,
        checkinRate: checkin.rate,
      },
    });
  } catch (err) {
    console.error(`[mukoko] GET /api/events/${id}/analytics failed`, err);
    return NextResponse.json({ error: "Failed to load analytics" }, { status: 500 });
  }
}
