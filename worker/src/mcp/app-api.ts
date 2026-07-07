/**
 * Thin client for the nhimbe app API (`https://nhimbe.com/api`).
 *
 * The MCP owns no database. Reads hit the public listing endpoints; writes hit
 * the authenticated `/api/events` write endpoints, forwarding the caller's
 * WorkOS bearer token. The app is the single trust boundary — this client just
 * shapes requests and tolerates the app's `{ events }` / `{ event }` envelopes.
 */

import type { Env } from "../types";

export interface AppEventLocation {
  type?: string;
  name?: string;
  streetAddress?: string;
  addressLocality?: string;
  addressCountry?: string;
  url?: string;
}

export interface AppEventOffer {
  price?: number | string;
  priceCurrency?: string;
  url?: string;
}

/** Structural subset of the app's public `Event` shape that the MCP renders. */
export interface AppEvent {
  id: string;
  shortCode?: string;
  slug?: string;
  name: string;
  description?: string;
  startDate?: string;
  endDate?: string;
  date?: { day?: string; month?: string; full?: string; time?: string };
  location?: AppEventLocation;
  category?: string;
  keywords?: string[];
  image?: string;
  coverGradient?: string;
  attendeeCount?: number;
  maximumAttendeeCapacity?: number;
  eventAttendanceMode?: string;
  eventStatus?: string;
  offers?: AppEventOffer;
}

export interface ListEventsParams {
  city?: string;
  category?: string;
  limit?: number;
  offset?: number;
}

/** Error carrying the upstream status so tools can distinguish 401 from 5xx. */
export class AppApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "AppApiError";
  }
}

function appBase(env: Env): string {
  return (env.APP_API_URL || "https://nhimbe.com").replace(/\/$/, "");
}

async function readJson(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** GET /api/events — public listing, filterable by city + category. */
export async function listEvents(env: Env, params: ListEventsParams = {}): Promise<AppEvent[]> {
  const url = new URL(`${appBase(env)}/api/events`);
  if (params.city) url.searchParams.set("city", params.city);
  if (params.category) url.searchParams.set("category", params.category);
  url.searchParams.set("limit", String(params.limit ?? 12));
  if (params.offset) url.searchParams.set("offset", String(params.offset));

  const res = await fetch(url.toString(), { headers: { Accept: "application/json" } });
  if (!res.ok) throw new AppApiError(`Event listing failed (${res.status})`, res.status);

  const body = (await readJson(res)) as { events?: AppEvent[] } | null;
  return body?.events ?? [];
}

/** GET /api/events/:idOrSlugOrShortCode — single event, or null on 404. */
export async function getEvent(env: Env, idOrCode: string): Promise<AppEvent | null> {
  const res = await fetch(`${appBase(env)}/api/events/${encodeURIComponent(idOrCode)}`, {
    headers: { Accept: "application/json" },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new AppApiError(`Event lookup failed (${res.status})`, res.status);

  const body = (await readJson(res)) as { event?: AppEvent } | null;
  return body?.event ?? null;
}

/** POST /api/events — create an event as the bearer's WorkOS user. */
export async function createEvent(
  env: Env,
  token: string,
  input: Record<string, unknown>,
): Promise<AppEvent> {
  const res = await fetch(`${appBase(env)}/api/events`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(input),
  });
  const body = (await readJson(res)) as { event?: AppEvent; error?: string } | null;
  if (!res.ok) {
    throw new AppApiError(body?.error || `Create failed (${res.status})`, res.status);
  }
  if (!body?.event) throw new AppApiError("Create returned no event", 502);
  return body.event;
}

/** PATCH /api/events/:id — update/manage an event the bearer's user hosts. */
export async function updateEvent(
  env: Env,
  token: string,
  id: string,
  patch: Record<string, unknown>,
): Promise<AppEvent> {
  const res = await fetch(`${appBase(env)}/api/events/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(patch),
  });
  const body = (await readJson(res)) as { event?: AppEvent; error?: string } | null;
  if (!res.ok) {
    throw new AppApiError(body?.error || `Update failed (${res.status})`, res.status);
  }
  if (!body?.event) throw new AppApiError("Update returned no event", 502);
  return body.event;
}
