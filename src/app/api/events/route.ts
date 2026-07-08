/**
 * GET  /api/events — public event listing, backed directly by MongoDB.
 * POST /api/events — create an event as a bearer-authenticated WorkOS user
 *                    (used by the nhimbe MCP server's `create_event` tool).
 *
 * GET is the Vercel-native replacement for the Cloudflare Worker's `/api/events`
 * route; it returns the same `{ events, pagination }` shape the `src/lib/api.ts`
 * client expects. POST shares the exact create path the `createEvent` server
 * action uses, only with identity resolved from a bearer token instead of a
 * cookie session.
 *
 * Node runtime + dynamic: the MongoDB driver requires Node (not edge), and
 * these are live reads/writes that must not be statically cached.
 */

import { NextResponse } from "next/server";
import { listEvents } from "@/lib/mongo/events";
import { createEventForPerson, type CreateEventActionInput } from "@/app/actions/events";
import { resolveActorFromBearer, ActorError } from "@/lib/auth/mcp-actor";

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

/** POST /api/events — create an event as the bearer's WorkOS user (MCP). */
export async function POST(request: Request) {
  let person;
  try {
    person = await resolveActorFromBearer(request.headers.get("Authorization"));
  } catch (err) {
    if (err instanceof ActorError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }

  let body: Partial<CreateEventActionInput>;
  try {
    body = (await request.json()) as Partial<CreateEventActionInput>;
  } catch {
    return NextResponse.json({ error: "Request body must be JSON." }, { status: 400 });
  }

  // Normalize into the action input shape, defaulting the safe fields.
  const input: CreateEventActionInput = {
    name: String(body.name ?? ""),
    description: String(body.description ?? ""),
    startDate: String(body.startDate ?? ""),
    endDate: body.endDate ?? null,
    category: body.category ?? null,
    keywords: Array.isArray(body.keywords) ? body.keywords : [],
    image: body.image ?? null,
    coverGradient: body.coverGradient ?? null,
    isOnline: Boolean(body.isOnline),
    venue: body.venue,
    streetAddress: body.streetAddress,
    addressLocality: body.addressLocality,
    addressCountry: body.addressCountry,
    meetingUrl: body.meetingUrl ?? null,
    meetingPlatform: body.meetingPlatform ?? null,
    maximumAttendeeCapacity: body.maximumAttendeeCapacity ?? null,
    isFree: body.isFree ?? true,
    ticketUrl: body.ticketUrl ?? null,
    visibility: body.visibility === "private" ? "private" : "public",
    requiresApproval: Boolean(body.requiresApproval),
    hostMode: body.hostMode === "organization" || body.hostMode === "family" ? body.hostMode : "person",
    hostEntityId: body.hostEntityId ?? null,
  };

  try {
    const { id, event } = await createEventForPerson(person, input);
    return NextResponse.json({ id, event }, { status: 201 });
  } catch (err) {
    // Validation failures throw plain Errors — surface their message as a 400.
    const message = err instanceof Error ? err.message : "Failed to create event.";
    console.error("[mukoko] POST /api/events failed", err);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
