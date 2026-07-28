/**
 * GET   /api/events/:id/registrations — list a hosted event's attendees
 *                                       (RSVP + check-in status, incl. PII).
 * PATCH /api/events/:id/registrations — approve / reject / cancel a
 *                                       registration, or check an attendee in.
 *
 * Bearer-authed HOST endpoints for the Mukoko Events MCP's
 * `list_event_registrations` + `manage_registration` tools. Auth is a WorkOS
 * access token (`Authorization: Bearer …`) resolved to the acting person, who
 * must host the event — the same entity-centric gate the cookie-session
 * `src/app/actions/host-registrations.ts` actions enforce. The attendee read
 * exposes PII, so it is host-gated too.
 *
 * Node runtime + dynamic: the MongoDB driver needs Node, and these are live
 * host reads/writes that must not be statically cached.
 */

import { NextResponse } from "next/server";
import { requireBearerEventHost, ActorError } from "@/lib/auth/mcp-host";
import {
  getEventRegistrations,
  setRegistrationApproval,
  cancelRegistration,
  checkInAttendee,
} from "@/lib/mongo/host-registrations";
import { rsvpsCollection } from "@/lib/mongo/databases";
import { readJsonBody, clampString } from "@/lib/security/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Action = "approve" | "reject" | "cancel" | "checkin";
const ACTIONS: readonly Action[] = ["approve", "reject", "cancel", "checkin"];

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
    const registrations = await getEventRegistrations(ctx.event._id);
    return NextResponse.json({ registrations });
  } catch (err) {
    console.error(`[mukoko] GET /api/events/${id}/registrations failed`, err);
    return NextResponse.json({ error: "Failed to load registrations" }, { status: 500 });
  }
}

export async function PATCH(
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

  const parsed = await readJsonBody<{ action?: string; registrationId?: string }>(request);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: parsed.status });
  }

  const action = clampString(parsed.data.action, 20) as Action;
  const registrationId = clampString(parsed.data.registrationId, 200);
  if (!registrationId) {
    return NextResponse.json({ error: "A registrationId is required." }, { status: 400 });
  }
  if (!ACTIONS.includes(action)) {
    return NextResponse.json(
      { error: "action must be one of: approve, reject, cancel, checkin." },
      { status: 400 },
    );
  }

  // The registration must belong to THIS event — the host gate above proved the
  // caller hosts the event, but not that the rsvp is one of its rows.
  const rsvps = await rsvpsCollection();
  const rsvp = await rsvps.findOne({ _id: registrationId, eventId: ctx.event._id });
  if (!rsvp) {
    return NextResponse.json({ error: "Registration not found for this event." }, { status: 404 });
  }

  try {
    switch (action) {
      case "approve":
        await setRegistrationApproval(registrationId, "approved");
        return NextResponse.json({ message: "Registration approved", registrationId, status: "approved" });
      case "reject":
        await setRegistrationApproval(registrationId, "rejected");
        return NextResponse.json({ message: "Registration rejected", registrationId, status: "rejected" });
      case "cancel":
        await cancelRegistration(registrationId);
        return NextResponse.json({ message: "Registration cancelled", registrationId, status: "cancelled" });
      case "checkin":
        await checkInAttendee(ctx.event._id, registrationId, ctx.person._id);
        return NextResponse.json({ message: "Attendee checked in", registrationId, status: "attended" });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to update registration.";
    console.error(`[mukoko] PATCH /api/events/${id}/registrations failed`, err);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
