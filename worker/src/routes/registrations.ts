import { Hono } from "hono";
import type { Env } from "../types";
import { writeAuth } from "../middleware/auth";
import { getAuthenticatedUser } from "../auth/workos";
import { validateRequiredFields } from "../utils/validation";
import { unauthorized, notFound, badRequest, forbidden } from "../utils/response";
import { supabaseFetch } from "../db/supabase";

interface RsvpRow {
  id: string;
  event_id: string;
  agent_person_id: string;
  rsvpresponse: string;
  created_at: string | null;
  updated_at: string | null;
  confirmation_status: string | null;
  confirmed_at: string | null;
}

// Map events.rsvp_action → legacy registration shape. The frontend reads
// `status` as the lifecycle ("registered","approved","cancelled","attended"),
// which we derive from rsvpresponse + confirmation_status.
function deriveStatus(row: RsvpRow): string {
  if (row.rsvpresponse === "rsvpNo") return "cancelled";
  if (row.confirmation_status === "approved") return "approved";
  if (row.confirmation_status === "rejected") return "rejected";
  if (row.confirmation_status === "attended") return "attended";
  return "registered";
}

function mapRow(row: RsvpRow) {
  return {
    id: row.id,
    eventId: row.event_id,
    userId: row.agent_person_id,
    status: deriveStatus(row),
    ticketType: null,
    ticketPrice: null,
    ticketCurrency: null,
    registeredAt: row.created_at,
    cancelledAt: row.rsvpresponse === "rsvpNo" ? row.updated_at : null,
    checkedInAt: null,
  };
}

const RSVP_COLS = "id,event_id,agent_person_id,rsvpresponse,created_at,updated_at,confirmation_status,confirmed_at";

export const registrations = new Hono<{ Bindings: Env }>();
registrations.use("*", writeAuth);

// GET /api/registrations?event_id= OR ?user_id=
registrations.get("/", async (c) => {
  const eventId = c.req.query("event_id");
  const userId = c.req.query("user_id");

  if (!eventId && !userId) {
    return badRequest(c, "event_id or user_id required");
  }

  const filter = eventId
    ? `event_id=eq.${encodeURIComponent(eventId)}`
    : `agent_person_id=eq.${encodeURIComponent(userId!)}`;

  const rows = await supabaseFetch<RsvpRow[]>(c.env, {
    schema: "events",
    path: "rsvp_action",
    query: `${filter}&select=${RSVP_COLS}`,
  }) ?? [];

  return c.json({ registrations: rows.map(mapRow) });
});

// POST /api/registrations — atomic capacity check + RSVP insert.
registrations.post("/", async (c) => {
  let body: Record<string, unknown>;
  try {
    body = await c.req.json();
  } catch {
    return badRequest(c, "Invalid JSON body");
  }

  const err = validateRequiredFields(body, ["eventId", "userId"]);
  if (err) return badRequest(c, err);

  const eventId = String(body.eventId);
  const userId = String(body.userId);

  interface EventStateRow {
    id: string;
    maximumattendeecapacity: number | null;
    attendee_count: number | null;
    visibility: string;
    eventstatus: string;
  }
  const event = await supabaseFetch<EventStateRow>(c.env, {
    schema: "events",
    path: "event",
    query: `id=eq.${encodeURIComponent(eventId)}&select=id,maximumattendeecapacity,attendee_count,visibility,eventstatus`,
    single: true,
  });

  if (!event) return notFound(c, "Event");
  if (event.visibility !== "public" || event.eventstatus !== "EventScheduled") {
    return badRequest(c, "Event is not available for registration");
  }
  if (event.maximumattendeecapacity && (event.attendee_count ?? 0) >= event.maximumattendeecapacity) {
    return badRequest(c, "Event is at capacity");
  }

  const existing = await supabaseFetch<{ id: string }>(c.env, {
    schema: "events",
    path: "rsvp_action",
    query: `event_id=eq.${encodeURIComponent(eventId)}&agent_person_id=eq.${encodeURIComponent(userId)}&rsvpresponse=neq.rsvpNo&select=id&limit=1`,
    single: true,
  });
  if (existing) {
    return badRequest(c, "User is already registered for this event");
  }

  // No equivalent of the D1 UPDATE…WHERE attendee_count<capacity atomic
  // increment via PostgREST raw, so we delegate to the SECURITY DEFINER
  // function events.try_register_attendee, which performs the conditional
  // UPDATE in a single statement. The pre-check above is kept for the nice
  // error message; the RPC is the authoritative gate against over-capacity
  // under concurrent load.
  const inserted = await supabaseFetch<{ id: string }[]>(c.env, {
    schema: "events",
    path: "rsvp_action",
    method: "POST",
    body: {
      event_id: eventId,
      agent_person_id: userId,
      rsvpresponse: "rsvpYes",
      sync_version: 1,
      additional_guests: 0,
      starttime: new Date().toISOString(),
    },
  });

  const newCount = await supabaseFetch<number | null>(c.env, {
    schema: "events",
    path: "rpc/try_register_attendee",
    method: "POST",
    body: { p_event_id: eventId },
  });

  if (newCount === null) {
    // RPC's conditional UPDATE matched no rows — event either disappeared
    // between our pre-check and now, or another concurrent registration
    // pushed it over capacity. Roll back the RSVP we just inserted.
    const insertedId = inserted?.[0]?.id;
    if (insertedId) {
      await supabaseFetch(c.env, {
        schema: "events",
        path: "rsvp_action",
        query: `id=eq.${encodeURIComponent(insertedId)}`,
        method: "DELETE",
      });
    }
    return badRequest(c, "Event is at capacity");
  }

  return c.json({ id: inserted?.[0]?.id, message: "Registration successful" }, 201);
});

const ALLOWED_STATUSES = new Set(["approved", "rejected", "pending", "registered", "attended"]);

// PUT /api/registrations/:id — host approves/rejects/attended; user can re-confirm.
registrations.put("/:id", async (c) => {
  const regId = c.req.param("id");
  let body: { status: string };
  try {
    body = await c.req.json();
  } catch {
    return badRequest(c, "Invalid JSON body");
  }

  if (!body.status || !ALLOWED_STATUSES.has(body.status)) {
    return badRequest(c, "Invalid status. Must be: approved, rejected, pending, registered, or attended");
  }

  interface RegRow {
    id: string;
    event_id: string;
    agent_person_id: string;
  }
  const reg = await supabaseFetch<RegRow>(c.env, {
    schema: "events",
    path: "rsvp_action",
    query: `id=eq.${encodeURIComponent(regId)}&select=id,event_id,agent_person_id`,
    single: true,
  });
  if (!reg) {
    return notFound(c, "Registration");
  }

  // Resolve the event organizer for authz.
  const event = await supabaseFetch<{ organizer_person_id: string | null }>(c.env, {
    schema: "events",
    path: "event",
    query: `id=eq.${encodeURIComponent(reg.event_id)}&select=organizer_person_id`,
    single: true,
  });

  const authResult = await getAuthenticatedUser(c.req.raw, c.env);
  if (!authResult.user) {
    return unauthorized(c);
  }

  // Map WorkOS userId → identity.person.id for authz comparisons.
  const requester = await supabaseFetch<{ id: string }>(c.env, {
    schema: "identity",
    path: "person",
    query: `workos_user_id=eq.${encodeURIComponent(authResult.user.userId)}&select=id`,
    single: true,
  });
  const requesterPersonId = requester?.id ?? null;

  const isHost = !!event && !!requesterPersonId && event.organizer_person_id === requesterPersonId;
  const isRegistrant = reg.agent_person_id === requesterPersonId;

  if (!isHost && ["approved", "rejected", "attended"].includes(body.status)) {
    return forbidden(c, "Only the event host can approve, reject, or mark attendance");
  }
  if (!isHost && !isRegistrant) {
    return forbidden(c, "Not authorized to update this registration");
  }

  await supabaseFetch(c.env, {
    schema: "events",
    path: "rsvp_action",
    query: `id=eq.${encodeURIComponent(regId)}`,
    method: "PATCH",
    body: { confirmation_status: body.status, confirmed_at: new Date().toISOString() },
  });

  return c.json({ message: `Registration ${body.status}` });
});

// DELETE /api/registrations/:id — soft cancel + attendee_count decrement.
registrations.delete("/:id", async (c) => {
  const regId = c.req.param("id");

  const reg = await supabaseFetch<{ id: string; event_id: string; rsvpresponse: string }>(c.env, {
    schema: "events",
    path: "rsvp_action",
    query: `id=eq.${encodeURIComponent(regId)}&select=id,event_id,rsvpresponse`,
    single: true,
  });

  if (reg && reg.rsvpresponse !== "rsvpNo") {
    await supabaseFetch(c.env, {
      schema: "events",
      path: "rsvp_action",
      query: `id=eq.${encodeURIComponent(regId)}`,
      method: "PATCH",
      body: { rsvpresponse: "rsvpNo", updated_at: new Date().toISOString() },
    });

    // Atomic decrement via SECURITY DEFINER function (GREATEST clamps at 0).
    await supabaseFetch(c.env, {
      schema: "events",
      path: "rpc/decrement_attendee_count",
      method: "POST",
      body: { p_event_id: reg.event_id },
    });
  }

  return c.json({ message: "Registration cancelled" });
});
