import { Hono } from "hono";
import type { Env } from "../types";
import { writeAuth } from "../middleware/auth";
import { getAuthenticatedUser } from "../auth/workos";
import { unauthorized, notFound, badRequest, conflict } from "../utils/response";
import { supabaseFetch } from "../db/supabase";

export const waitlist = new Hono<{ Bindings: Env }>();
waitlist.use("*", writeAuth);

// POST /api/events/:eventId/waitlist — Join the waitlist for a capacity-bound event.
waitlist.post("/events/:eventId/waitlist", async (c) => {
  const eventId = c.req.param("eventId");
  const body = await c.req.json() as { userId: string };

  if (!body.userId) {
    return badRequest(c, "userId is required");
  }

  interface EventRow { id: string; maximumattendeecapacity: number | null }
  const event = await supabaseFetch<EventRow>(c.env, {
    schema: "events",
    path: "event",
    query: `id=eq.${encodeURIComponent(eventId)}&select=id,maximumattendeecapacity`,
    single: true,
  });

  if (!event) {
    return notFound(c, "Event");
  }
  if (!event.maximumattendeecapacity) {
    return badRequest(c, "Event has no capacity limit — no waitlist needed");
  }

  const rsvps = await supabaseFetch<{ id: string }[]>(c.env, {
    schema: "events",
    path: "rsvp_action",
    query: `event_id=eq.${encodeURIComponent(eventId)}&rsvpresponse=neq.rsvpNo&select=id`,
  });
  if ((rsvps?.length ?? 0) < event.maximumattendeecapacity) {
    return badRequest(c, "Event is not at capacity — register directly instead");
  }

  const existing = await supabaseFetch<{ id: string }>(c.env, {
    schema: "events",
    path: "waitlist_entry",
    query: `event_id=eq.${encodeURIComponent(eventId)}&person_id=eq.${encodeURIComponent(body.userId)}&select=id`,
    single: true,
  });
  if (existing) {
    return conflict(c, "User is already on the waitlist");
  }

  const positions = await supabaseFetch<{ position: number }[]>(c.env, {
    schema: "events",
    path: "waitlist_entry",
    query: `event_id=eq.${encodeURIComponent(eventId)}&select=position&order=position.desc&limit=1`,
  });
  const position = (positions?.[0]?.position ?? 0) + 1;

  interface InsertedRow { id: string }
  const inserted = await supabaseFetch<InsertedRow[]>(c.env, {
    schema: "events",
    path: "waitlist_entry",
    method: "POST",
    body: {
      event_id: eventId,
      person_id: body.userId,
      position,
      status: "waiting",
      joined_at: new Date().toISOString(),
    },
  });

  return c.json({ id: inserted?.[0]?.id, position, message: "Added to waitlist" }, 201);
});

// DELETE /api/events/:eventId/waitlist — Leave the waitlist.
waitlist.delete("/events/:eventId/waitlist", async (c) => {
  const eventId = c.req.param("eventId");
  const body = await c.req.json() as { userId: string };

  if (!body.userId) {
    return badRequest(c, "userId is required");
  }

  const existing = await supabaseFetch<{ id: string }>(c.env, {
    schema: "events",
    path: "waitlist_entry",
    query: `event_id=eq.${encodeURIComponent(eventId)}&person_id=eq.${encodeURIComponent(body.userId)}&select=id`,
    single: true,
  });
  if (!existing) {
    return notFound(c, "User on waitlist");
  }

  await supabaseFetch(c.env, {
    schema: "events",
    path: "waitlist_entry",
    query: `id=eq.${encodeURIComponent(existing.id)}`,
    method: "DELETE",
  });

  return c.json({ message: "Removed from waitlist" });
});

// GET /api/events/:eventId/waitlist — List for the event (auth required; email exposed only to host).
waitlist.get("/events/:eventId/waitlist", async (c) => {
  const authResult = await getAuthenticatedUser(c.req.raw, c.env);
  if (!authResult.user) {
    return unauthorized(c);
  }

  const eventId = c.req.param("eventId");

  interface EventOrgRow { organizer_person_id: string | null }
  const event = await supabaseFetch<EventOrgRow>(c.env, {
    schema: "events",
    path: "event",
    query: `id=eq.${encodeURIComponent(eventId)}&select=organizer_person_id`,
    single: true,
  });

  // Resolve the requester's identity.person id to compare against the
  // organizer. workos_user_id is the linkage column.
  let requesterPersonId: string | null = null;
  interface PersonRow { id: string }
  const requester = await supabaseFetch<PersonRow>(c.env, {
    schema: "identity",
    path: "person",
    query: `workos_user_id=eq.${encodeURIComponent(authResult.user.userId)}&select=id`,
    single: true,
  });
  requesterPersonId = requester?.id ?? null;

  const isHost = !!event && !!requesterPersonId && event.organizer_person_id === requesterPersonId;

  interface WaitRow { id: string; event_id: string; person_id: string; position: number; joined_at: string | null }
  const rows = await supabaseFetch<WaitRow[]>(c.env, {
    schema: "events",
    path: "waitlist_entry",
    query: `event_id=eq.${encodeURIComponent(eventId)}&select=id,event_id,person_id,position,joined_at&order=position.asc`,
  }) ?? [];

  // Join names/emails. Single query for all person_ids.
  const personIds = Array.from(new Set(rows.map((r) => r.person_id)));
  interface PersonNameRow { id: string; name: string; email: string | null }
  const persons = personIds.length
    ? (await supabaseFetch<PersonNameRow[]>(c.env, {
        schema: "identity",
        path: "person",
        query: `id=in.(${personIds.map(encodeURIComponent).join(",")})&select=id,name,email`,
      })) ?? []
    : [];
  const personById = new Map(persons.map((p) => [p.id, p]));

  const waitlistEntries = rows.map((row) => {
    const person = personById.get(row.person_id);
    return {
      id: row.id,
      eventId: row.event_id,
      userId: row.person_id,
      position: row.position,
      userName: person?.name ?? null,
      ...(isHost && person?.email ? { userEmail: person.email } : {}),
      dateCreated: row.joined_at,
    };
  });

  return c.json({ waitlist: waitlistEntries, total: waitlistEntries.length });
});
