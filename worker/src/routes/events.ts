import { Hono } from "hono";
import type { Env, Event } from "../types";
import { safeParseInt, slugify, getInitials } from "../utils/validation";
import { writeAuth } from "../middleware/auth";
import { getAuthenticatedUser } from "../auth/workos";
import { indexEvent, removeEventFromIndex } from "../ai/embeddings";
import { toCsv } from "../utils/export";
import { logAudit } from "../utils/audit";
import { unauthorized, notFound, badRequest, forbidden, conflict } from "../utils/response";
import { supabaseFetch } from "../db/supabase";
import { fetchEventsByIds, mapSupabaseEventToApi, EVENT_COLUMNS, type SupabaseEventRow } from "../db/event_mapper";

export const events = new Hono<{ Bindings: Env }>();
events.use("*", writeAuth);

// GET /api/events?city=&category=&limit=&offset=
events.get("/", async (c) => {
  const city = c.req.query("city");
  const category = c.req.query("category");
  const limit = safeParseInt(c.req.query("limit") || null, 20, 1, 100);
  const offset = safeParseInt(c.req.query("offset") || null, 0, 0, 10000);

  const filters = [
    "visibility=eq.public",
    "eventstatus=eq.EventScheduled",
  ];
  if (city) filters.push(`location->>addresslocality=eq.${encodeURIComponent(city)}`);
  if (category) filters.push(`category=eq.${encodeURIComponent(category)}`);

  const rows = await supabaseFetch<SupabaseEventRow[]>(c.env, {
    schema: "events",
    path: "event",
    query: `${filters.join("&")}&select=${EVENT_COLUMNS}&order=startdate.asc&limit=${limit}&offset=${offset}`,
  }) ?? [];

  // No exact-count helper without a SQL function; we return rows.length for
  // the page and let the frontend infer "more" by checking whether the page
  // is full. This is good-enough until usage demands precise pagination.
  return c.json({
    events: rows.map(mapSupabaseEventToApi),
    pagination: { limit, offset, total: rows.length },
  });
});

// GET /api/events/trending — must precede /:id
events.get("/trending", async (c) => {
  const city = c.req.query("city");
  const limit = safeParseInt(c.req.query("limit") || null, 10, 1, 50);

  const filters = [
    "visibility=eq.public",
    "eventstatus=eq.EventScheduled",
    `startdate=gte.${encodeURIComponent(new Date().toISOString())}`,
  ];
  if (city) filters.push(`location->>addresslocality=eq.${encodeURIComponent(city)}`);

  const rows = await supabaseFetch<(SupabaseEventRow & { view_count: number | null })[]>(c.env, {
    schema: "events",
    path: "event",
    query: `${filters.join("&")}&select=${EVENT_COLUMNS},view_count&order=view_count.desc.nullslast&limit=${limit}`,
  }) ?? [];

  const eventsList = rows.map((row) => {
    const event = mapSupabaseEventToApi(row);
    const views = row.view_count ?? 0;
    return {
      ...event,
      views,
      trend: views > 10 ? 100 : 0,
      isHot: views > 50,
    };
  });

  return c.json({ events: eventsList });
});

// GET /api/events/:id — accepts uuid or slug.
events.get("/:id", async (c) => {
  const id = c.req.param("id");

  // Try uuid first.
  let row = await supabaseFetch<SupabaseEventRow>(c.env, {
    schema: "events",
    path: "event",
    query: `id=eq.${encodeURIComponent(id)}&select=${EVENT_COLUMNS}`,
    single: true,
  });

  if (!row) {
    row = await supabaseFetch<SupabaseEventRow>(c.env, {
      schema: "events",
      path: "event",
      query: `slug=eq.${encodeURIComponent(id)}&select=${EVENT_COLUMNS}`,
      single: true,
    });
  }

  if (!row) {
    return notFound(c, "Event");
  }

  return c.json({ event: mapSupabaseEventToApi(row) });
});

// POST /api/events — Create an event on Supabase events.event.
events.post("/", async (c) => {
  const body = await c.req.json() as Partial<Event> & { organizerPersonId?: string };

  const slug = body.slug || slugify(body.name || "");
  const organizerPersonId = body.organizerPersonId || body.organizer?.identifier;
  if (!organizerPersonId) {
    return badRequest(c, "organizerPersonId or organizer.identifier required");
  }

  const insertBody: Record<string, unknown> = {
    name: body.name,
    description: body.description ?? null,
    eventtype: "Event",
    eventstatus: body.eventStatus || "EventScheduled",
    eventattendancemode: body.eventAttendanceMode || "OfflineEventAttendanceMode",
    startdate: body.startDate,
    enddate: body.endDate ?? null,
    timezone: "UTC",
    visibility: body.isPublished === false ? "private" : "public",
    calendar_type: "events",
    owner_type: "person",
    owner_id: organizerPersonId,
    organizer_person_id: organizerPersonId,
    organizer: {
      name: body.organizer?.name,
      alternatename: body.organizer?.alternateName,
      initials: body.organizer?.initials || getInitials(body.organizer?.name || ""),
      eventcount: body.organizer?.eventCount ?? 0,
    },
    location: {
      "@type": body.location?.type ?? "Place",
      name: body.location?.name,
      streetaddress: body.location?.streetAddress,
      addresslocality: body.location?.addressLocality,
      addresscountry: body.location?.addressCountry,
      url: body.location?.url,
    },
    offers: body.offers
      ? {
          price: body.offers.price,
          pricecurrency: body.offers.priceCurrency,
          url: body.offers.url,
          availability: body.offers.availability || (body.offers.price ? "InStock" : "Free"),
        }
      : null,
    category: body.category ?? null,
    keywords: body.keywords ?? [],
    image: body.image ? [body.image] : null,
    attendee_count: body.attendeeCount ?? 0,
    maximumattendeecapacity: body.maximumAttendeeCapacity ?? null,
    slug,
    sync_version: 1,
  };

  const inserted = await supabaseFetch<SupabaseEventRow[]>(c.env, {
    schema: "events",
    path: "event",
    method: "POST",
    body: insertBody,
  });

  const newRow = inserted?.[0];
  if (!newRow) {
    return c.json({ error: "Failed to create event" }, 500);
  }
  const event = mapSupabaseEventToApi(newRow);

  await indexEvent(c.env.AI, c.env.VECTORIZE, event);

  return c.json({ event, message: "Event created successfully" }, 201);
});

// PUT /api/events/:id
events.put("/:id", async (c) => {
  const eventId = c.req.param("id");
  const body = await c.req.json() as Partial<Event>;

  const patch: Record<string, unknown> = {};
  if (body.name) patch.name = body.name;
  if (body.description) patch.description = body.description;
  if (body.category) patch.category = body.category;
  if (body.keywords) patch.keywords = body.keywords;
  if (body.eventStatus) patch.eventstatus = body.eventStatus;

  const updated = await supabaseFetch<SupabaseEventRow[]>(c.env, {
    schema: "events",
    path: "event",
    query: `id=eq.${encodeURIComponent(eventId)}&select=${EVENT_COLUMNS}`,
    method: "PATCH",
    body: patch,
  });

  if (updated && updated[0]) {
    await indexEvent(c.env.AI, c.env.VECTORIZE, mapSupabaseEventToApi(updated[0]));
  }

  return c.json({ message: "Event updated successfully" });
});

// POST /api/events/:id/cancel
events.post("/:id/cancel", async (c) => {
  const eventId = c.req.param("id");

  const existing = await supabaseFetch<{ id: string; eventstatus: string }>(c.env, {
    schema: "events",
    path: "event",
    query: `id=eq.${encodeURIComponent(eventId)}&select=id,eventstatus`,
    single: true,
  });

  if (!existing) return notFound(c, "Event");
  if (existing.eventstatus === "EventCancelled") {
    return badRequest(c, "Event is already cancelled");
  }

  await supabaseFetch(c.env, {
    schema: "events",
    path: "event",
    query: `id=eq.${encodeURIComponent(eventId)}`,
    method: "PATCH",
    body: { eventstatus: "EventCancelled" },
  });

  await logAudit(c.env, { action: "event.cancelled", resourceType: "event", resourceId: eventId });

  return c.json({ eventId, eventStatus: "EventCancelled", message: "Event cancelled successfully" });
});

// DELETE /api/events/:id
events.delete("/:id", async (c) => {
  const eventId = c.req.param("id");

  await supabaseFetch(c.env, {
    schema: "events",
    path: "event",
    query: `id=eq.${encodeURIComponent(eventId)}`,
    method: "DELETE",
  });
  await removeEventFromIndex(c.env.VECTORIZE, eventId);
  await logAudit(c.env, { action: "event.deleted", resourceType: "event", resourceId: eventId });

  return c.json({ message: "Event deleted successfully" });
});

// POST /api/events/:id/view — bump view_count on the row.
// Uses the atomic SECURITY DEFINER function so concurrent views don't lose
// increments to the read-modify-write race.
events.post("/:id/view", async (c) => {
  const eventId = c.req.param("id");
  try {
    await supabaseFetch(c.env, {
      schema: "events",
      path: "rpc/increment_view_count",
      method: "POST",
      body: { p_event_id: eventId },
    });
    return c.json({ message: "View tracked" });
  } catch (error) {
    console.error("Failed to track view:", error);
    return c.json({ message: "View tracking failed" }, 500);
  }
});

// GET /api/events/:id/reviews — list + aggregate stats.
events.get("/:id/reviews", async (c) => {
  const eventId = c.req.param("id");

  interface ReviewRow {
    id: string;
    author: string;
    rating_value: number;
    review_body: string;
    helpful_count: number | null;
    created_at: string | null;
  }

  const rowsRaw = await supabaseFetch<ReviewRow[]>(c.env, {
    schema: "engagement",
    path: "review",
    query: `item_reviewed_id=eq.${encodeURIComponent(eventId)}&item_reviewed_type=eq.events.event&select=id,author,rating_value,review_body,helpful_count,created_at&order=helpful_count.desc.nullslast,created_at.desc&limit=50`,
  }) ?? [];

  // Author names via batched person lookup.
  const authorIds = Array.from(new Set(rowsRaw.map((r) => r.author)));
  interface PersonNameRow { id: string; name: string }
  const persons = authorIds.length
    ? (await supabaseFetch<PersonNameRow[]>(c.env, {
        schema: "identity",
        path: "person",
        query: `id=in.(${authorIds.map(encodeURIComponent).join(",")})&select=id,name`,
      })) ?? []
    : [];
  const personById = new Map(persons.map((p) => [p.id, p.name]));

  const reviews = rowsRaw.map((row) => ({
    id: row.id,
    eventId,
    userId: row.author,
    userName: personById.get(row.author) || "Anonymous",
    userInitials: getInitials(personById.get(row.author) || "Anonymous"),
    rating: row.rating_value,
    reviewBody: row.review_body || undefined,
    helpfulCount: row.helpful_count ?? 0,
    isVerifiedAttendee: false,
    dateCreated: row.created_at,
  }));

  const totalReviews = reviews.length;
  const averageRating = totalReviews
    ? reviews.reduce((s, r) => s + r.rating, 0) / totalReviews
    : 0;
  const distribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const r of reviews) distribution[r.rating] = (distribution[r.rating] || 0) + 1;

  return c.json({
    reviews,
    stats: { averageRating, totalReviews, distribution },
  });
});

// POST /api/events/:id/reviews — Create a review row.
events.post("/:id/reviews", async (c) => {
  const eventId = c.req.param("id");
  const body = await c.req.json() as {
    userId: string;
    rating: number;
    reviewBody?: string;
  };

  if (!body.userId || !body.rating || body.rating < 1 || body.rating > 5) {
    return badRequest(c, "userId and rating (1-5) required");
  }

  try {
    const inserted = await supabaseFetch<{ id: string }[]>(c.env, {
      schema: "engagement",
      path: "review",
      method: "POST",
      body: {
        schema_type: "Review",
        author: body.userId,
        item_reviewed_type: "events.event",
        item_reviewed_id: eventId,
        item_reviewed_schema: "events",
        review_rating: { ratingValue: body.rating, bestRating: 5, worstRating: 1 },
        rating_value: body.rating,
        review_body: body.reviewBody || "",
      },
    });

    if (c.env.ANALYTICS_QUEUE) {
      await c.env.ANALYTICS_QUEUE.send({
        type: "review",
        eventId,
        userId: body.userId,
        data: { rating: body.rating },
        timestamp: new Date().toISOString(),
      });
    }

    return c.json({ id: inserted?.[0]?.id, message: "Review submitted successfully" }, 201);
  } catch {
    return conflict(c, "You have already reviewed this event");
  }
});

// GET /api/events/:id/stats — Per-event analytics.
events.get("/:id/stats", async (c) => {
  const eventId = c.req.param("id");

  const [event, rsvps, checkins, refs] = await Promise.all([
    supabaseFetch<{ view_count: number | null }>(c.env, {
      schema: "events",
      path: "event",
      query: `id=eq.${encodeURIComponent(eventId)}&select=view_count`,
      single: true,
    }),
    supabaseFetch<{ id: string }[]>(c.env, {
      schema: "events",
      path: "rsvp_action",
      query: `event_id=eq.${encodeURIComponent(eventId)}&rsvpresponse=neq.rsvpNo&select=id`,
    }),
    supabaseFetch<{ id: string }[]>(c.env, {
      schema: "events",
      path: "check_in",
      query: `event_id=eq.${encodeURIComponent(eventId)}&select=id`,
    }),
    supabaseFetch<{ id: string }[]>(c.env, {
      schema: "engagement",
      path: "referral",
      query: `target_entity_id=eq.${encodeURIComponent(eventId)}&status=eq.converted&select=id`,
    }),
  ]);

  const views = event?.view_count ?? 0;
  const recentViews = 0; // view-windowed stats moved to service_bus.events (TBD).

  return c.json({
    eventId,
    views,
    uniqueViews: views, // distinct viewer tracking moved to service_bus.events.
    rsvps: rsvps?.length ?? 0,
    checkins: checkins?.length ?? 0,
    referrals: refs?.length ?? 0,
    trend: recentViews > views * 0.5 ? 100 : 0,
    isHot: views > 50,
  });
});

// GET /api/events/:id/registrations/export — Host-only CSV export.
events.get("/:id/registrations/export", async (c) => {
  const eventId = c.req.param("id");
  const format = c.req.query("format") || "csv";

  if (format !== "csv") {
    return badRequest(c, "Only CSV format is currently supported");
  }

  const authResult = await getAuthenticatedUser(c.req.raw, c.env);
  if (!authResult.user) {
    return unauthorized(c);
  }

  const event = await supabaseFetch<{ id: string; organizer_person_id: string | null }>(c.env, {
    schema: "events",
    path: "event",
    query: `id=eq.${encodeURIComponent(eventId)}&select=id,organizer_person_id`,
    single: true,
  });

  if (!event) return notFound(c, "Event");

  const requester = await supabaseFetch<{ id: string }>(c.env, {
    schema: "identity",
    path: "person",
    query: `workos_user_id=eq.${encodeURIComponent(authResult.user.userId)}&select=id`,
    single: true,
  });

  if (!requester || event.organizer_person_id !== requester.id) {
    return forbidden(c, "Only the event host can export registrations");
  }

  interface RsvpRow {
    id: string;
    agent_person_id: string;
    rsvpresponse: string;
    created_at: string | null;
    confirmation_status: string | null;
  }

  const rsvps = await supabaseFetch<RsvpRow[]>(c.env, {
    schema: "events",
    path: "rsvp_action",
    query: `event_id=eq.${encodeURIComponent(eventId)}&select=id,agent_person_id,rsvpresponse,created_at,confirmation_status&order=created_at.asc`,
  }) ?? [];

  const personIds = Array.from(new Set(rsvps.map((r) => r.agent_person_id)));
  interface PersonRow { id: string; name: string; email: string | null }
  const persons = personIds.length
    ? (await supabaseFetch<PersonRow[]>(c.env, {
        schema: "identity",
        path: "person",
        query: `id=in.(${personIds.map(encodeURIComponent).join(",")})&select=id,name,email`,
      })) ?? []
    : [];
  const personById = new Map(persons.map((p) => [p.id, p]));

  const rows = rsvps.map((r) => ({
    id: r.id,
    user_id: r.agent_person_id,
    user_name: personById.get(r.agent_person_id)?.name ?? null,
    user_email: personById.get(r.agent_person_id)?.email ?? null,
    status: r.confirmation_status || (r.rsvpresponse === "rsvpNo" ? "cancelled" : "registered"),
    registered_at: r.created_at,
    checked_in_at: null,
  }));

  const csv = toCsv(rows as unknown as Record<string, unknown>[], [
    "id", "user_id", "user_name", "user_email", "status", "registered_at", "checked_in_at",
  ]);

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="registrations-${eventId}.csv"`,
    },
  });
});

// Side-export used by admin routes for re-indexing.
export async function fetchPublishedEvents(env: Env): Promise<Event[]> {
  const rows = await supabaseFetch<SupabaseEventRow[]>(env, {
    schema: "events",
    path: "event",
    query: `visibility=eq.public&select=${EVENT_COLUMNS}&limit=2000`,
  }) ?? [];
  return rows.map(mapSupabaseEventToApi);
}

export { fetchEventsByIds };
