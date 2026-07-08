/**
 * GET   /api/events/:id — single event by `_id`, slug, or shortCode, backed by
 *                         MongoDB. Mirrors the worker's `{ event }` response
 *                         shape (404 → the client's `getEventById` returns null).
 * PATCH /api/events/:id — update/manage an event as a bearer-authenticated
 *                         WorkOS host (the nhimbe MCP's `update_event` tool).
 *
 * Node runtime: the MongoDB driver requires Node, not edge.
 */

import { NextResponse } from "next/server";
import { getEventByIdOrSlug } from "@/lib/mongo/events";
import { updateEventForPerson, type UpdateEventInput } from "@/app/actions/events";
import { resolveActorFromBearer, ActorError } from "@/lib/auth/mcp-actor";

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

/** PATCH /api/events/:id — host-gated update as the bearer's WorkOS user (MCP). */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  let person;
  try {
    person = await resolveActorFromBearer(request.headers.get("Authorization"));
  } catch (err) {
    if (err instanceof ActorError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }

  let body: UpdateEventInput;
  try {
    body = (await request.json()) as UpdateEventInput;
  } catch {
    return NextResponse.json({ error: "Request body must be JSON." }, { status: 400 });
  }

  try {
    const { event } = await updateEventForPerson(person, id, body);
    return NextResponse.json({ event });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to update event.";
    // "not a host" → 403; "not found" → 404; validation → 400.
    const status = /not a host/i.test(message) ? 403 : /could not be found/i.test(message) ? 404 : 400;
    console.error(`[mukoko] PATCH /api/events/${id} failed`, err);
    return NextResponse.json({ error: message }, { status });
  }
}
