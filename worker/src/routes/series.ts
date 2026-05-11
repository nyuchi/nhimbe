import { Hono } from "hono";
import type { Env } from "../types";
import { writeAuth } from "../middleware/auth";
import { supabaseFetch } from "../db/supabase";

export const series = new Hono<{ Bindings: Env }>();
series.use("*", writeAuth);

// "Series" is no longer a separate table. The parent event IS the series:
// events.event has rrule + recurrence_end + series_parent_id + series_occurrence
// already on the row. /api/series/:id resolves to that parent; occurrences are
// rows where series_parent_id = :id.

// POST /api/series — Create the parent (template) event with an rrule.
// Body keeps the legacy shape; we mirror it onto events.event columns.
series.post("/", async (c) => {
  const body = await c.req.json() as {
    name: string;
    recurrenceRule: string;
    hostId: string;
    templateEventId?: string;
    maxOccurrences?: number;
    endsAt?: string;
  };

  if (!body.name || !body.recurrenceRule || !body.hostId) {
    return c.json({ error: "name, recurrenceRule, and hostId are required" }, 400);
  }

  // If the caller supplies a template event id, we just patch it with the
  // series rrule. Otherwise we create a stub parent — the host will fill in
  // dates/location via the regular event-edit flow.
  if (body.templateEventId) {
    await supabaseFetch(c.env, {
      schema: "events",
      path: "event",
      query: `id=eq.${encodeURIComponent(body.templateEventId)}`,
      method: "PATCH",
      body: {
        name: body.name,
        rrule: body.recurrenceRule,
        recurrence_end: body.endsAt ?? null,
      },
    });
    return c.json({ id: body.templateEventId, message: "Series created" }, 201);
  }

  interface InsertedRow { id: string }
  const inserted = await supabaseFetch<InsertedRow[]>(c.env, {
    schema: "events",
    path: "event",
    method: "POST",
    body: {
      name: body.name,
      eventtype: "Event",
      eventstatus: "EventScheduled",
      eventattendancemode: "OfflineEventAttendanceMode",
      startdate: new Date().toISOString(),
      timezone: "UTC",
      visibility: "private",
      calendar_type: "events",
      owner_type: "person",
      owner_id: body.hostId,
      organizer_person_id: body.hostId,
      organizer: { name: "Unknown", initials: "??" },
      location: { name: "TBD", addresslocality: "TBD", addresscountry: "TBD" },
      rrule: body.recurrenceRule,
      recurrence_end: body.endsAt ?? null,
    },
  });

  return c.json({ id: inserted?.[0]?.id, message: "Series created" }, 201);
});

// GET /api/series/:id — Return the parent event in legacy "series" shape.
series.get("/:id", async (c) => {
  const id = c.req.param("id");

  interface SeriesParent {
    id: string;
    name: string;
    rrule: string | null;
    recurrence_end: string | null;
    organizer_person_id: string | null;
    created_at: string | null;
    updated_at: string | null;
  }

  const row = await supabaseFetch<SeriesParent>(c.env, {
    schema: "events",
    path: "event",
    query: `id=eq.${encodeURIComponent(id)}&select=id,name,rrule,recurrence_end,organizer_person_id,created_at,updated_at`,
    single: true,
  });

  if (!row || !row.rrule) {
    return c.json({ error: "Series not found" }, 404);
  }

  return c.json({
    id: row.id,
    name: row.name,
    recurrenceRule: row.rrule,
    hostId: row.organizer_person_id,
    templateEventId: row.id,
    maxOccurrences: null,
    endsAt: row.recurrence_end,
    dateCreated: row.created_at,
    dateModified: row.updated_at,
  });
});

// PUT /api/series/:id — Update name / rrule / endsAt on the parent.
series.put("/:id", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json() as {
    name?: string;
    recurrenceRule?: string;
    maxOccurrences?: number;
    endsAt?: string;
  };

  const patch: Record<string, unknown> = {};
  if (body.name !== undefined) patch.name = body.name;
  if (body.recurrenceRule !== undefined) patch.rrule = body.recurrenceRule;
  if (body.endsAt !== undefined) patch.recurrence_end = body.endsAt;

  if (Object.keys(patch).length === 0) {
    return c.json({ error: "No fields to update" }, 400);
  }

  const updated = await supabaseFetch<{ id: string }[]>(c.env, {
    schema: "events",
    path: "event",
    query: `id=eq.${encodeURIComponent(id)}&rrule=not.is.null`,
    method: "PATCH",
    body: patch,
  });

  if (!updated || updated.length === 0) {
    return c.json({ error: "Series not found" }, 404);
  }

  return c.json({ message: "Series updated" });
});

// DELETE /api/series/:id — Cancel future occurrences then clear rrule on parent.
series.delete("/:id", async (c) => {
  const id = c.req.param("id");
  const now = new Date().toISOString();

  await supabaseFetch(c.env, {
    schema: "events",
    path: "event",
    query: `series_parent_id=eq.${encodeURIComponent(id)}&startdate=gt.${encodeURIComponent(now)}`,
    method: "PATCH",
    body: { eventstatus: "EventCancelled" },
  });

  const cleared = await supabaseFetch<{ id: string }[]>(c.env, {
    schema: "events",
    path: "event",
    query: `id=eq.${encodeURIComponent(id)}&rrule=not.is.null`,
    method: "PATCH",
    body: { rrule: null, recurrence_end: null },
  });

  if (!cleared || cleared.length === 0) {
    return c.json({ error: "Series not found" }, 404);
  }

  return c.json({ message: "Series cancelled and future events updated" });
});

// GET /api/series/:id/events — Occurrences (children of the parent series).
series.get("/:id/events", async (c) => {
  const id = c.req.param("id");
  const limit = Math.max(1, Math.min(100, parseInt(c.req.query("limit") || "20", 10)));
  const offset = Math.max(0, parseInt(c.req.query("offset") || "0", 10));

  interface OccurrenceRow {
    id: string;
    name: string;
    startdate: string;
    enddate: string | null;
    eventstatus: string;
    series_occurrence: number | null;
  }

  const rows = await supabaseFetch<OccurrenceRow[]>(c.env, {
    schema: "events",
    path: "event",
    query: `series_parent_id=eq.${encodeURIComponent(id)}&select=id,name,startdate,enddate,eventstatus,series_occurrence&order=series_occurrence.asc,startdate.asc&limit=${limit}&offset=${offset}`,
  }) ?? [];

  return c.json({
    events: rows.map((r) => ({
      id: r.id,
      name: r.name,
      startDate: r.startdate,
      endDate: r.enddate,
      status: r.eventstatus,
      seriesIndex: r.series_occurrence,
    })),
    pagination: { limit, offset, count: rows.length },
  });
});
