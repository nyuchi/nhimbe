import { Hono } from "hono";
import type { Env, CommunityStats } from "../types";
import { supabaseFetch } from "../db/supabase";

export const stats = new Hono<{ Bindings: Env }>();

interface EventRow {
  id: string;
  category: string | null;
  attendee_count: number | null;
  organizer_person_id: string | null;
  startdate: string;
  location: Record<string, unknown> | null;
  created_at: string | null;
}

// GET /api/community/stats
// Reads events.event directly; filters by city using the location->>addresslocality
// jsonb path. Aggregations are computed in-worker — fine while the dataset is
// small; can move to a SQL view + RPC later if it grows.
stats.get("/stats", async (c) => {
  const city = c.req.query("city");

  const cityFilter = city
    ? `&location->>addresslocality=eq.${encodeURIComponent(city)}`
    : "";

  const rows = await supabaseFetch<EventRow[]>(c.env, {
    schema: "events",
    path: "event",
    query:
      "select=id,category,attendee_count,organizer_person_id,startdate,location,created_at" +
      `&visibility=eq.public&eventstatus=eq.${encodeURIComponent("https://schema.org/EventScheduled")}` +
      cityFilter +
      "&limit=2000",
  }) ?? [];

  const totalEvents = rows.length;
  const totalAttendees = rows.reduce((sum, r) => sum + (r.attendee_count ?? 0), 0);
  const activeHosts = new Set(rows.map((r) => r.organizer_person_id).filter(Boolean)).size;

  const sevenDaysAgoMs = Date.now() - 7 * 24 * 3600 * 1000;
  const recent = rows.filter((r) => r.created_at && new Date(r.created_at).getTime() >= sevenDaysAgoMs);
  const recentByCat = new Map<string, number>();
  const totalByCat = new Map<string, number>();
  for (const r of rows) {
    const k = r.category ?? "uncategorized";
    totalByCat.set(k, (totalByCat.get(k) ?? 0) + 1);
  }
  for (const r of recent) {
    const k = r.category ?? "uncategorized";
    recentByCat.set(k, (recentByCat.get(k) ?? 0) + 1);
  }
  const trendingCategories = Array.from(recentByCat.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([category, count]) => {
      const lastWeek = (totalByCat.get(category) ?? 0) - count;
      const change = lastWeek > 0 ? Math.round(((count - lastWeek) / lastWeek) * 100) : 100;
      return { category, change, events: count };
    });

  const venueCounts = new Map<string, number>();
  for (const r of rows) {
    const venue = (r.location?.name as string | undefined) ?? null;
    if (!venue) continue;
    venueCounts.set(venue, (venueCounts.get(venue) ?? 0) + 1);
  }
  const popularVenues = Array.from(venueCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([venue, count]) => ({ venue, events: count }));

  const slotCounts = new Map<string, number>();
  for (const r of rows) {
    const d = new Date(r.startdate);
    if (isNaN(d.getTime())) continue;
    const key = `${d.getUTCDay()}-${d.getUTCHours()}`;
    slotCounts.set(key, (slotCounts.get(key) ?? 0) + 1);
  }
  let peakTime = "No data yet";
  if (slotCounts.size > 0) {
    let bestKey = "";
    let bestCount = -1;
    for (const [k, v] of slotCounts) {
      if (v > bestCount) { bestCount = v; bestKey = k; }
    }
    const [dayStr, hourStr] = bestKey.split("-");
    const day = parseInt(dayStr, 10);
    const hour = parseInt(hourStr, 10);
    const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    peakTime = `${dayNames[day]} ${hour}:00-${hour + 2}:00`;
  }

  const communityStats: CommunityStats = {
    addressLocality: city || undefined,
    totalEvents,
    totalAttendees,
    activeHosts,
    trendingCategories,
    peakTime,
    popularVenues,
  };

  return c.json({ stats: communityStats });
});

// GET /api/community/events/:eventId/analytics — Host analytics for one event.
// Views currently come from events.event.view_count (the columnar counter
// already on the row); RSVPs from events.rsvp_action; referrals from
// engagement.referral.
stats.get("/events/:eventId/analytics", async (c) => {
  const eventId = c.req.param("eventId");

  const [eventRow, rsvps, refs] = await Promise.all([
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
      schema: "engagement",
      path: "referral",
      query: `target_entity_id=eq.${encodeURIComponent(eventId)}&select=id`,
    }),
  ]);

  const views = eventRow?.view_count ?? 0;
  const registrations = rsvps?.length ?? 0;
  const referrals = refs?.length ?? 0;
  const conversionRate = views > 0 ? Math.round((registrations / views) * 10000) / 100 : 0;

  return c.json({ eventId, views, registrations, conversionRate, referrals });
});
