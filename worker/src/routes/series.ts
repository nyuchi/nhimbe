import { Hono } from "hono";
import type { Env } from "../types";
import { writeAuth } from "../middleware/auth";
import { requireRequesterPersonId } from "../auth/identity";
import { forbidden, notFound, badRequest } from "../utils/response";
import { supabaseFetch } from "../db/supabase";

export const series = new Hono<{ Bindings: Env }>();
series.use("*", writeAuth);

// "Series" is no longer a separate table. The parent event IS the series:
// events.event has rrule + recurrence_end + series_parent_id + series_occurrence
// already on the row. /api/series/:id resolves to that parent; occurrences are
// rows where series_parent_id = :id.

// Helper: load the organizer for an event row that's also a series parent
// (rrule is not null). Used by the PUT/DELETE handlers below.
async function loadSeriesOrganizer(env: Env, id: string): Promise<string | null | undefined> {
  const row = await supabaseFetch<{ organizer_person_id: string | null; rrule: string | null }>(env, {
    schema: "events",
    path: "event",
    query: `id=eq.${encodeURIComponent(id)}&select=organizer_person_id,rrule`,
    single: true,
  });
  if (!row || !row.rrule) return undefined; // undefined = not found / not a series
  return row.organizer_person_id;
}

// POST /api/series — Create the parent (template) event with an rrule.
// hostId is derived from the WorkOS JWT.
series.post("/", async (c) => {
  const body = await c.req.json() as {
    name: string;
    recurrenceRule: string;
    templateEventId?: string;
    maxOccurrences?: number;
    endsAt?: string;
  };

  if (!body.name || !body.recurrenceRule) {
    return badRequest(c, "name and recurrenceRule are required");
  }

  const r = await requireRequesterPersonId(c);
  if (typeof r !== "string") return r;
  const hostId = r;

  // If the caller supplies a template event id, we just patch it with the
  // series rrule. The requester must own the template event row.
  if (body.templateEventId) {
    const orgId = await loadSeriesOrganizer(c.env, body.templateEventId);
    // For the patch case we don't require the template to already be a series,
    // so re-fetch organizer directly to allow promoting a regular event row.
    const tmplRow = await supabaseFetch<{ organizer_person_id: string | null }>(c.env, {
      schema: "events",
      path: "event",
      query: `id=eq.${encodeURIComponent(body.templateEventId)}&select=organizer_person_id`,
      single: true,
    });
    const ownerId = orgId ?? tmplRow?.organizer_person_id ?? undefined;
    if (!tmplRow) return notFound(c, "Template event");
    if (ownerId !== hostId) {
      return forbidden(c, "Only the event organizer can promote it to a series");
    }
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
      eventstatus: "https://schema.org/EventScheduled",
      eventattendancemode: "https://schema.org/OfflineEventAttendanceMode",
      startdate: new Date().toISOString(),
      timezone: "UTC",
      visibility: "private",
      calendar_type: "nhimbe",
      owner_type: "person",
      owner_id: hostId,
      organizer_person_id: hostId,
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
// Only the parent event's organizer may update.
series.put("/:id", async (c) => {
  const id = c.req.param("id");

  const r = await requireRequesterPersonId(c);
  if (typeof r !== "string") return r;
  const requesterPersonId = r;

  const orgId = await loadSeriesOrganizer(c.env, id);
  if (orgId === undefined) return notFound(c, "Series");
  if (orgId !== requesterPersonId) {
    return forbidden(c, "Only the series organizer can update this series");
  }

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
    return badRequest(c, "No fields to update");
  }

  const updated = await supabaseFetch<{ id: string }[]>(c.env, {
    schema: "events",
    path: "event",
    query: `id=eq.${encodeURIComponent(id)}&rrule=not.is.null`,
    method: "PATCH",
    body: patch,
  });

  if (!updated || updated.length === 0) {
    return notFound(c, "Series");
  }

  return c.json({ message: "Series updated" });
});

// DELETE /api/series/:id — Cancel future occurrences then clear rrule on parent.
// Only the parent event's organizer may delete.
series.delete("/:id", async (c) => {
  const id = c.req.param("id");

  const r = await requireRequesterPersonId(c);
  if (typeof r !== "string") return r;
  const requesterPersonId = r;

  const orgId = await loadSeriesOrganizer(c.env, id);
  if (orgId === undefined) return notFound(c, "Series");
  if (orgId !== requesterPersonId) {
    return forbidden(c, "Only the series organizer can delete this series");
  }

  const now = new Date().toISOString();

  await supabaseFetch(c.env, {
    schema: "events",
    path: "event",
    query: `series_parent_id=eq.${encodeURIComponent(id)}&startdate=gt.${encodeURIComponent(now)}`,
    method: "PATCH",
    body: { eventstatus: "https://schema.org/EventCancelled" },
  });

  const cleared = await supabaseFetch<{ id: string }[]>(c.env, {
    schema: "events",
    path: "event",
    query: `id=eq.${encodeURIComponent(id)}&rrule=not.is.null`,
    method: "PATCH",
    body: { rrule: null, recurrence_end: null },
  });

  if (!cleared || cleared.length === 0) {
    return notFound(c, "Series");
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
