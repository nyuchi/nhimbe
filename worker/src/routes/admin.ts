import { Hono } from "hono";
import type { Context } from "hono";
import type { Env, UserRole } from "../types";
import { getAdminUser } from "../middleware/auth";
import { safeParseInt } from "../utils/validation";
import { removeEventFromIndex } from "../ai/embeddings";
import { logAudit } from "../utils/audit";
import { unauthorized, notFound, badRequest, forbidden } from "../utils/response";
import { supabaseFetch, supabaseFetchWithCount } from "../db/supabase";
import { mapSupabaseEventToApi, type SupabaseEventRow, EVENT_COLUMNS } from "../db/event_mapper";

export const admin = new Hono<{ Bindings: Env }>();

async function fetchCount(
  env: Env,
  schema: string,
  path: string,
  filterQuery: string,
): Promise<number> {
  // Authoritative row count via PostgREST's `Prefer: count=exact` header —
  // returned in `Content-Range: 0-0/<total>`. We ask for a 1-row window
  // (`limit=1`) so we pay the count-query cost but transfer almost no rows.
  // The previous implementation fetched up to 10k ids and counted locally,
  // which silently truncated dashboards once a table crossed that threshold.
  const { total } = await supabaseFetchWithCount<{ id: string }[]>(env, {
    schema,
    path,
    query: `${filterQuery}${filterQuery ? "&" : ""}select=id&limit=1`,
  });
  return total ?? 0;
}

// GET /api/admin/stats — top-of-dashboard counters + recent activity.
admin.get("/stats", async (c) => {
  const adminUser = await getAdminUser(c.req.raw, c.env, "moderator");
  if (!adminUser) {
    return unauthorized(c, "moderator");
  }

  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 3600 * 1000).toISOString();
  const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 3600 * 1000).toISOString();

  const [
    totalUsers, totalEvents, totalRsvps, activeEvents,
    recentUsersCount, prevUsersCount,
    recentEventsCount, prevEventsCount,
  ] = await Promise.all([
    fetchCount(c.env, "identity", "person", ""),
    fetchCount(c.env, "events",   "event",  ""),
    fetchCount(c.env, "events",   "rsvp_action", ""),
    fetchCount(c.env, "events",   "event", `startdate=gte.${encodeURIComponent(now.toISOString())}`),
    fetchCount(c.env, "identity", "person", `created_at=gte.${encodeURIComponent(thirtyDaysAgo)}`),
    fetchCount(c.env, "identity", "person", `created_at=gte.${encodeURIComponent(sixtyDaysAgo)}&created_at=lt.${encodeURIComponent(thirtyDaysAgo)}`),
    fetchCount(c.env, "events",   "event",  `created_at=gte.${encodeURIComponent(thirtyDaysAgo)}`),
    fetchCount(c.env, "events",   "event",  `created_at=gte.${encodeURIComponent(sixtyDaysAgo)}&created_at=lt.${encodeURIComponent(thirtyDaysAgo)}`),
  ]);

  // 5 most recent events + users.
  interface RecentEventRow { id: string; name: string; startdate: string; attendee_count: number | null }
  const recentEventsRows = await supabaseFetch<RecentEventRow[]>(c.env, {
    schema: "events",
    path: "event",
    query: "select=id,name,startdate,attendee_count&order=created_at.desc&limit=5",
  }) ?? [];

  interface RecentUserRow { id: string; name: string; email: string | null; created_at: string | null }
  const recentUsersRows = await supabaseFetch<RecentUserRow[]>(c.env, {
    schema: "identity",
    path: "person",
    query: "select=id,name,email,created_at&order=created_at.desc&limit=5",
  }) ?? [];

  const recentEvents = recentEventsRows.map((e) => {
    const eventDate = new Date(e.startdate);
    let status: "upcoming" | "ongoing" | "past" = "upcoming";
    if (eventDate < now) status = "past";
    else if (eventDate.toDateString() === now.toDateString()) status = "ongoing";
    return {
      id: e.id,
      title: e.name,
      date: eventDate.toLocaleDateString("en-US"),
      attendeeCount: e.attendee_count ?? 0,
      status,
    };
  });

  const recentUsers = recentUsersRows.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email ?? "",
    createdAt: u.created_at
      ? new Date(u.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })
      : "",
  }));

  function calcGrowth(curr: number, prev: number): number {
    if (prev === 0) return curr > 0 ? 100 : 0;
    return Math.round(((curr - prev) / prev) * 100);
  }

  return c.json({
    stats: {
      totalUsers,
      totalEvents,
      totalRegistrations: totalRsvps,
      activeEvents,
      userGrowth: calcGrowth(recentUsersCount, prevUsersCount),
      eventGrowth: calcGrowth(recentEventsCount, prevEventsCount),
      recentViews: 0, // sourced from service_bus.events in a follow-up.
      viewsGrowth: 0,
    },
    recentEvents,
    recentUsers,
    tickets: [], // support-tickets surface moved to a dedicated app (mukoko-support).
  });
});

// GET /api/admin/users — Paged list with optional name/email search.
admin.get("/users", async (c) => {
  const adminUser = await getAdminUser(c.req.raw, c.env, "admin");
  if (!adminUser) {
    return unauthorized(c, "admin");
  }

  const limit = safeParseInt(c.req.query("limit") || null, 20, 1, 100);
  const offset = safeParseInt(c.req.query("offset") || null, 0, 0, 10000);
  const search = c.req.query("search") || "";

  // PostgREST OR with ilike — supabaseFetch already URL-encodes path/query.
  const filter = search
    ? `or=(name.ilike.*${encodeURIComponent(search)}*,email.ilike.*${encodeURIComponent(search)}*)`
    : "";

  interface PersonRow {
    id: string; email: string | null; name: string;
    alternatename: string | null; image: string | null;
    address: Record<string, unknown> | null;
    role: string; created_at: string | null;
    deleted_at: string | null;
  }

  const rows = await supabaseFetch<PersonRow[]>(c.env, {
    schema: "identity",
    path: "person",
    query: `select=id,email,name,alternatename,image,address,role,created_at,deleted_at&order=created_at.desc&limit=${limit}&offset=${offset}${filter ? `&${filter}` : ""}`,
  }) ?? [];

  const users = rows.map((u) => {
    const addr = (u.address ?? {}) as Record<string, unknown>;
    return {
      id: u.id,
      email: u.email ?? "",
      name: u.name,
      alternateName: u.alternatename,
      image: u.image,
      addressLocality: (addr.addresslocality as string | undefined) ?? null,
      addressCountry: (addr.addresscountry as string | undefined) ?? null,
      eventsAttended: 0,
      eventsHosted: 0,
      role: u.role,
      status: u.deleted_at ? "suspended" : ("active" as const),
      dateCreated: u.created_at,
    };
  });

  const total = await fetchCount(c.env, "identity", "person", filter);

  return c.json({ users, total });
});

admin.post("/users/:id/suspend",  async (c) => handleAdminUserAction(c, "suspend"));
admin.post("/users/:id/activate", async (c) => handleAdminUserAction(c, "activate"));
admin.post("/users/:id/role",     async (c) => handleAdminUserAction(c, "role"));

async function handleAdminUserAction(
  c: Context<{ Bindings: Env }>,
  action: string,
) {
  const userId = c.req.param("id") || "";
  const requiredRole: UserRole = action === "role" ? "super_admin" : "admin";
  const adminUser = await getAdminUser(c.req.raw, c.env, requiredRole);
  if (!adminUser) {
    return unauthorized(c, requiredRole);
  }

  if (userId === adminUser.id && (action === "suspend" || action === "role")) {
    return badRequest(c, "Cannot modify your own account");
  }

  const target = await supabaseFetch<{ id: string; role: string }>(c.env, {
    schema: "identity",
    path: "person",
    query: `id=eq.${encodeURIComponent(userId)}&select=id,role`,
    single: true,
  });

  if (!target) {
    return notFound(c, "User");
  }

  switch (action) {
    case "suspend": {
      // Suspend uses the same lifecycle signal as soft-delete (deleted_at).
      // Future iteration: split into mit_status='suspended' for recoverable
      // suspensions vs deleted_at for terminal removal — for now both share
      // the column so consumers have a single "is this account live?" filter.
      await supabaseFetch(c.env, {
        schema: "identity",
        path: "person",
        query: `id=eq.${encodeURIComponent(userId)}`,
        method: "PATCH",
        body: { deleted_at: new Date().toISOString() },
      });
      await logAudit(c.env, { actorId: adminUser.id, action: "user.suspended", resourceType: "user", resourceId: userId });
      return c.json({ message: "User suspended" });
    }
    case "activate": {
      await supabaseFetch(c.env, {
        schema: "identity",
        path: "person",
        query: `id=eq.${encodeURIComponent(userId)}`,
        method: "PATCH",
        body: { deleted_at: null },
      });
      await logAudit(c.env, { actorId: adminUser.id, action: "user.activated", resourceType: "user", resourceId: userId });
      return c.json({ message: "User activated" });
    }
    case "role": {
      const body = await c.req.json() as { role?: string };
      const newRole = body.role as UserRole;
      if (!["user", "moderator", "admin", "super_admin"].includes(newRole)) {
        return badRequest(c, "Invalid role");
      }
      if (newRole === "super_admin" && adminUser.role !== "super_admin") {
        return forbidden(c, "Only super_admin can assign super_admin role");
      }
      await supabaseFetch(c.env, {
        schema: "identity",
        path: "person",
        query: `id=eq.${encodeURIComponent(userId)}`,
        method: "PATCH",
        body: { role: newRole },
      });
      await logAudit(c.env, { actorId: adminUser.id, action: "user.role_changed", resourceType: "user", resourceId: userId, details: { newRole } });
      return c.json({ message: `User role updated to ${newRole}` });
    }
    default:
      return badRequest(c, "Unknown action");
  }
}

// GET /api/admin/events — Paged event list with name/description search + status filter.
admin.get("/events", async (c) => {
  const adminUser = await getAdminUser(c.req.raw, c.env, "moderator");
  if (!adminUser) {
    return unauthorized(c, "moderator");
  }

  const limit = safeParseInt(c.req.query("limit") || null, 20, 1, 100);
  const offset = safeParseInt(c.req.query("offset") || null, 0, 0, 10000);
  const search = c.req.query("search") || "";
  const status = c.req.query("status") || "";

  const filters: string[] = [];
  if (search) {
    filters.push(`or=(name.ilike.*${encodeURIComponent(search)}*,description.ilike.*${encodeURIComponent(search)}*)`);
  }
  const now = new Date().toISOString();
  if (status === "upcoming") filters.push(`startdate=gte.${encodeURIComponent(now)}`);
  else if (status === "past") filters.push(`startdate=lt.${encodeURIComponent(now)}`);
  else if (status === "cancelled") filters.push(`eventstatus=eq.${encodeURIComponent("https://schema.org/EventCancelled")}`);

  const filterQuery = filters.join("&");
  const rows = await supabaseFetch<SupabaseEventRow[]>(c.env, {
    schema: "events",
    path: "event",
    query: `${filterQuery}${filterQuery ? "&" : ""}select=${EVENT_COLUMNS}&order=created_at.desc&limit=${limit}&offset=${offset}`,
  }) ?? [];

  const nowDate = new Date();
  const events = rows.map((row) => {
    const event = mapSupabaseEventToApi(row);
    const eventDate = new Date(event.startDate);
    let eventStatus: "upcoming" | "ongoing" | "past" | "cancelled" = "upcoming";
    if (event.eventStatus === "EventCancelled") eventStatus = "cancelled";
    else if (eventDate < nowDate) eventStatus = "past";
    else if (eventDate.toDateString() === nowDate.toDateString()) eventStatus = "ongoing";

    return {
      id: event.id,
      title: event.name,
      description: event.description,
      date: event.date,
      location: event.location,
      category: event.category,
      attendeeCount: event.attendeeCount,
      capacity: event.maximumAttendeeCapacity,
      organizer: event.organizer,
      status: eventStatus,
      dateCreated: event.dateCreated,
    };
  });

  const total = await fetchCount(c.env, "events", "event", filterQuery);

  return c.json({ events, total });
});

// DELETE /api/admin/events/:id
admin.delete("/events/:id", async (c) => {
  const eventId = c.req.param("id");
  const adminUser = await getAdminUser(c.req.raw, c.env, "moderator");
  if (!adminUser) {
    return unauthorized(c, "moderator");
  }

  const event = await supabaseFetch<{ id: string; name: string }>(c.env, {
    schema: "events",
    path: "event",
    query: `id=eq.${encodeURIComponent(eventId)}&select=id,name`,
    single: true,
  });
  if (!event) {
    return notFound(c, "Event");
  }

  await supabaseFetch(c.env, {
    schema: "events",
    path: "event",
    query: `id=eq.${encodeURIComponent(eventId)}`,
    method: "DELETE",
  });

  try {
    await removeEventFromIndex(c.env.VECTORIZE, eventId);
  } catch (error) {
    console.error("Failed to remove event from index:", error);
  }

  return c.json({ message: "Event deleted successfully" });
});

// POST /api/admin/index-events — Re-index all published events into Vectorize.
admin.post("/index-events", async (c) => {
  const { validateApiKey } = await import("../middleware/auth");
  if (!validateApiKey(c.req.raw, c.env)) {
    return unauthorized(c, "API key");
  }

  const { fetchPublishedEvents } = await import("./events");
  const { indexEvents } = await import("../ai/embeddings");

  const events = await fetchPublishedEvents(c.env);
  const indexResult = await indexEvents(c.env.AI, c.env.VECTORIZE, events);

  return c.json({
    message: "Indexing complete",
    indexed: indexResult.indexed,
    errors: indexResult.errors,
  });
});

// Support-tickets endpoints intentionally return empty results — the support
// app has moved out of nhimbe (to mukoko-support). Frontend admin UI degrades
// gracefully on the empty payload.
admin.get("/support", async (c) => {
  const adminUser = await getAdminUser(c.req.raw, c.env, "admin");
  if (!adminUser) {
    return unauthorized(c, "admin");
  }
  return c.json({ tickets: [], total: 0 });
});

admin.put("/support/:id/status", async (c) => {
  const adminUser = await getAdminUser(c.req.raw, c.env, "admin");
  if (!adminUser) return unauthorized(c, "admin");
  return c.json({ message: "Ticket status updated" });
});

admin.post("/support/:id/reply", async (c) => {
  const adminUser = await getAdminUser(c.req.raw, c.env, "admin");
  if (!adminUser) return unauthorized(c, "admin");
  return c.json({ message: "Reply sent", messageId: crypto.randomUUID() });
});
