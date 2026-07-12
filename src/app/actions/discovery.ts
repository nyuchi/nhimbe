"use server";

/**
 * Discovery read server actions (Vercel server runtime → MongoDB).
 *
 * These let client components read events / categories / cities / community
 * stats straight from MongoDB through the server, replacing the worker-era
 * `@/lib/api` fetches to `/api/*`. Return shapes match the old `@/lib/api`
 * helpers so call sites swap the import and `await` the action — no UI change.
 *
 * Server Components should prefer the underlying `@/lib/mongo/*` reads directly
 * (true SSR, no action round-trip); these actions exist for interactive client
 * components that fetch after mount.
 */

import { listEvents, getEventByIdOrSlug, getTrendingEvents } from "@/lib/mongo/events";
import { listCategories, listCities, getCommunityStats } from "@/lib/mongo/lookups";
import { recordEventView } from "@/lib/mongo/stats";
import type { Category, CommunityStats, Event, EventsResponse } from "@/lib/api";

export async function getEventsAction(params?: {
  city?: string;
  category?: string;
  limit?: number;
  offset?: number;
}): Promise<EventsResponse> {
  const { events, total, limit, offset } = await listEvents({
    city: params?.city,
    category: params?.category,
    limit: params?.limit,
    offset: params?.offset,
  });
  return { events, pagination: { limit, offset, total } };
}

export async function findEventAction(idOrSlug: string): Promise<Event | null> {
  return getEventByIdOrSlug(idOrSlug);
}

/**
 * Record a page view for an event (best-effort, server-side write). Replaces
 * the retired `POST /api/events/:id/view` worker fetch in `@/lib/api` — that
 * route handler no longer exists, so the client counted views into the void.
 * The counter lands on `mukoko.viewCount`, which `getEventStats` reads back.
 */
export async function trackEventViewAction(eventId: string): Promise<void> {
  await recordEventView(eventId);
}

export async function getTrendingEventsAction(params?: { limit?: number }): Promise<Event[]> {
  return getTrendingEvents(params?.limit ?? 10);
}

export async function getCategoriesAction(): Promise<Category[]> {
  return listCategories();
}

export async function getCitiesAction(): Promise<{ addressLocality: string; addressCountry: string }[]> {
  return listCities();
}

export async function getCommunityStatsAction(city?: string): Promise<CommunityStats> {
  return getCommunityStats(city);
}
