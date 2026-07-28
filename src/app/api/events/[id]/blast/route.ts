/**
 * POST /api/events/:id/blast — post a host announcement to an event and,
 * optionally, notify its attendees (in-app Campfire message + email).
 *
 * Bearer-authed HOST endpoint for the Mukoko Events MCP's `send_event_blast`
 * tool. Auth is a WorkOS access token resolved to the acting person, who must
 * host the event. Delegates the write (+ Campfire/email fan-out) to the shared
 * `writeEventUpdateForHost` core the cookie-session `postEventUpdate` action
 * also uses, so the MCP path and the manage-page path stay in lock-step.
 *
 * Node runtime + dynamic: live Mongo write that must not be statically cached.
 */

import { NextResponse } from "next/server";
import { requireBearerEventHost, ActorError } from "@/lib/auth/mcp-host";
import {
  writeEventUpdateForHost,
  UPDATE_TYPES,
  MAX_UPDATE_LENGTH,
  type EventUpdateType,
} from "@/lib/mongo/event-updates";
import { readJsonBody, clampString } from "@/lib/security/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
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

  const parsed = await readJsonBody<{
    text?: string;
    updateType?: string;
    notifyAttendees?: boolean;
  }>(request);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: parsed.status });
  }

  const text = clampString(parsed.data.text, MAX_UPDATE_LENGTH);
  if (!text) {
    return NextResponse.json({ error: "Write the announcement text to send." }, { status: 400 });
  }
  const rawType = clampString(parsed.data.updateType, 40);
  const updateType = (UPDATE_TYPES as readonly string[]).includes(rawType)
    ? (rawType as EventUpdateType)
    : undefined;

  try {
    const { updateId } = await writeEventUpdateForHost({
      person: ctx.person,
      event: ctx.event,
      text,
      updateType,
      notifyAttendees: parsed.data.notifyAttendees === true,
    });
    return NextResponse.json({
      message: parsed.data.notifyAttendees === true ? "Announcement sent to attendees" : "Announcement posted",
      updateId,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to post the announcement.";
    console.error(`[mukoko] POST /api/events/${id}/blast failed`, err);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
