import { Hono } from "hono";
import type { Env } from "../types";
import { writeAuth } from "../middleware/auth";
import { supabaseFetch } from "../db/supabase";
import { RSVP_NO } from "../db/event_mapper";

export const checkin = new Hono<{ Bindings: Env }>();
checkin.use("*", writeAuth);

// POST /api/events/:eventId/checkin — Check in an RSVP.
// Writes a CheckInAction row scoped to the event + person. Idempotent: if
// a non-cancelled CheckInAction already exists for (event,person) we return
// 409 with the existing check-in time.
checkin.post("/events/:eventId/checkin", async (c) => {
  const eventId = c.req.param("eventId");
  const body = await c.req.json() as { registrationId: string };

  if (!body.registrationId) {
    return c.json({ error: "registrationId is required" }, 400);
  }

  // The frontend still passes a registration id; it maps to events.rsvp_action.id.
  interface RsvpRow { id: string; agent_person_id: string; event_id: string }
  const rsvp = await supabaseFetch<RsvpRow>(c.env, {
    schema: "events",
    path: "rsvp_action",
    query: `id=eq.${encodeURIComponent(body.registrationId)}&event_id=eq.${encodeURIComponent(eventId)}&select=id,agent_person_id,event_id`,
    single: true,
  });

  if (!rsvp) {
    return c.json({ error: "Registration not found for this event" }, 404);
  }

  interface CheckInRow { id: string; checked_in_at: string | null }
  const existing = await supabaseFetch<CheckInRow>(c.env, {
    schema: "events",
    path: "check_in",
    query: `event_id=eq.${encodeURIComponent(eventId)}&person_id=eq.${encodeURIComponent(rsvp.agent_person_id)}&select=id,checked_in_at`,
    single: true,
  });

  if (existing) {
    return c.json({ error: "Already checked in", checkedInAt: existing.checked_in_at }, 409);
  }

  await supabaseFetch(c.env, {
    schema: "events",
    path: "check_in",
    method: "POST",
    body: {
      event_id: eventId,
      person_id: rsvp.agent_person_id,
      method: "manual",
      checked_in_at: new Date().toISOString(),
      // events.check_in.sync_version is NOT NULL — the legacy D1 mirror
      // expected a row version. Default new rows to 1.
      sync_version: 1,
    },
  });

  return c.json({ message: "Check-in successful", registrationId: body.registrationId });
});

// GET /api/events/:eventId/checkin/stats — Check-in stats for an event.
// "total" = non-cancelled RSVPs; "attended" = check-in rows.
checkin.get("/events/:eventId/checkin/stats", async (c) => {
  const eventId = c.req.param("eventId");

  // PostgREST count via Prefer: count=exact returns total in Content-Range,
  // but to keep the helper simple we just fetch ids and count client-side.
  const [rsvps, checkins] = await Promise.all([
    supabaseFetch<{ id: string }[]>(c.env, {
      schema: "events",
      path: "rsvp_action",
      query: `event_id=eq.${encodeURIComponent(eventId)}&rsvpresponse=neq.${encodeURIComponent(RSVP_NO)}&select=id`,
    }),
    supabaseFetch<{ id: string }[]>(c.env, {
      schema: "events",
      path: "check_in",
      query: `event_id=eq.${encodeURIComponent(eventId)}&select=id`,
    }),
  ]);

  const total = rsvps?.length ?? 0;
  const attended = checkins?.length ?? 0;

  return c.json({
    eventId,
    total,
    attended,
    remaining: total - attended,
    rate: total > 0 ? Math.round((attended / total) * 100) : 0,
  });
});
