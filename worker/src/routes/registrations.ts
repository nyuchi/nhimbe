import { Hono } from "hono";
import type { Env } from "../types";
import { writeAuth } from "../middleware/auth";
import { getAuthenticatedUser } from "../auth/workos";
import { validateRequiredFields } from "../utils/validation";
import { unauthorized, notFound, badRequest, forbidden } from "../utils/response";
import { supabaseFetch } from "../db/supabase";
import { RSVP_YES, RSVP_NO } from "../db/event_mapper";

// platform-db CHECK constraints. events.rsvp_action stores the fully-qualified
// schema.org URLs for rsvpresponse, and a narrow lifecycle enum for
// confirmation_status. The legacy nhimbe API surface speaks short forms; we
// translate at the worker boundary so the rest of the stack is unaffected.
//
// API status (what clients send and receive) → DB confirmation_status.
// "registered" is the default-no-host-action state and writes NULL.
// "attended" is host-actioned via /api/checkin (writes events.check_in),
// not via this endpoint, so it's intentionally absent from the writable set.
const API_TO_DB_CONFIRMATION: Record<string, string | null> = {
  approved: "confirmed",
  rejected: "declined",
  pending: "pending",
  registered: null,
};

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

interface CheckInRow {
  event_id: string;
  person_id: string;
  checked_in_at: string | null;
}

// Attendance is stored in events.check_in keyed on (event_id, person_id),
// not on rsvp_action. Derive the "attended" status by joining the two,
// rather than storing it twice. checkedIns is a map from "event_id|person_id"
// → checked_in_at timestamp.
function attendanceKey(eventId: string, personId: string): string {
  return `${eventId}|${personId}`;
}

// Map events.rsvp_action → legacy registration shape. The frontend reads
// `status` as the lifecycle ("registered","approved","rejected","cancelled",
// "attended","waitlisted"), which we derive from rsvpresponse +
// confirmation_status + join against events.check_in.
function deriveStatus(row: RsvpRow, checkedIns: Map<string, string>): string {
  if (row.rsvpresponse === RSVP_NO) return "cancelled";
  if (checkedIns.has(attendanceKey(row.event_id, row.agent_person_id))) return "attended";
  if (row.confirmation_status === "confirmed") return "approved";
  if (row.confirmation_status === "declined") return "rejected";
  if (row.confirmation_status === "waitlisted") return "waitlisted";
  return "registered";
}

function mapRow(row: RsvpRow, checkedIns: Map<string, string>) {
  const checkedInAt = checkedIns.get(attendanceKey(row.event_id, row.agent_person_id)) ?? null;
  return {
    id: row.id,
    eventId: row.event_id,
    userId: row.agent_person_id,
    status: deriveStatus(row, checkedIns),
    ticketType: null,
    ticketPrice: null,
    ticketCurrency: null,
    registeredAt: row.created_at,
    cancelledAt: row.rsvpresponse === RSVP_NO ? row.updated_at : null,
    checkedInAt,
  };
}

const RSVP_COLS = "id,event_id,agent_person_id,rsvpresponse,created_at,updated_at,confirmation_status,confirmed_at";

// Fetch check-ins for the scope of an rsvp result set. Either scoped by a
// single event (when filtered by event_id) or by a set of (event,person) pairs.
async function loadAttendance(env: Env, eventId: string | null, rsvps: RsvpRow[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (rsvps.length === 0) return map;

  // When the query was event-scoped, one filter on event_id suffices.
  // Otherwise we batch by person_id (the rsvp list is small enough that
  // PostgREST in.() is fine).
  const filter = eventId
    ? `event_id=eq.${encodeURIComponent(eventId)}`
    : `person_id=in.(${Array.from(new Set(rsvps.map(r => r.agent_person_id))).map(encodeURIComponent).join(",")})`;

  const rows = await supabaseFetch<CheckInRow[]>(env, {
    schema: "events",
    path: "check_in",
    query: `${filter}&select=event_id,person_id,checked_in_at`,
  }) ?? [];

  for (const ci of rows) {
    if (ci.checked_in_at) map.set(attendanceKey(ci.event_id, ci.person_id), ci.checked_in_at);
  }
  return map;
}

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

  const checkedIns = await loadAttendance(c.env, eventId ?? null, rows);
  return c.json({ registrations: rows.map((r) => mapRow(r, checkedIns)) });
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
  if (event.visibility !== "public" || event.eventstatus !== "https://schema.org/EventScheduled") {
    return badRequest(c, "Event is not available for registration");
  }
  if (event.maximumattendeecapacity && (event.attendee_count ?? 0) >= event.maximumattendeecapacity) {
    return badRequest(c, "Event is at capacity");
  }

  const existing = await supabaseFetch<{ id: string }>(c.env, {
    schema: "events",
    path: "rsvp_action",
    query: `event_id=eq.${encodeURIComponent(eventId)}&agent_person_id=eq.${encodeURIComponent(userId)}&rsvpresponse=neq.${encodeURIComponent(RSVP_NO)}&select=id&limit=1`,
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
      rsvpresponse: RSVP_YES,
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

const ALLOWED_STATUSES = new Set(Object.keys(API_TO_DB_CONFIRMATION));

// PUT /api/registrations/:id — host approves/rejects; user can self-confirm
// pending or registered. Attendance tracking goes through /api/checkin, not
// this endpoint, so "attended" is no longer accepted here.
registrations.put("/:id", async (c) => {
  const regId = c.req.param("id");
  let body: { status: string };
  try {
    body = await c.req.json();
  } catch {
    return badRequest(c, "Invalid JSON body");
  }

  if (!body.status || !ALLOWED_STATUSES.has(body.status)) {
    return badRequest(c, "Invalid status. Must be: approved, rejected, pending, or registered (use /api/checkin for attendance)");
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

  if (!isHost && ["approved", "rejected"].includes(body.status)) {
    return forbidden(c, "Only the event host can approve or reject");
  }
  if (!isHost && !isRegistrant) {
    return forbidden(c, "Not authorized to update this registration");
  }

  await supabaseFetch(c.env, {
    schema: "events",
    path: "rsvp_action",
    query: `id=eq.${encodeURIComponent(regId)}`,
    method: "PATCH",
    body: {
      confirmation_status: API_TO_DB_CONFIRMATION[body.status],
      confirmed_at: new Date().toISOString(),
    },
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

  if (reg && reg.rsvpresponse !== RSVP_NO) {
    await supabaseFetch(c.env, {
      schema: "events",
      path: "rsvp_action",
      query: `id=eq.${encodeURIComponent(regId)}`,
      method: "PATCH",
      body: { rsvpresponse: RSVP_NO, updated_at: new Date().toISOString() },
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
