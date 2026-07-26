/**
 * Task-based MCP tool definitions + handlers for nhimbe.
 *
 * The tools are TASKS a person (or their agent) actually wants done —
 * "events near me", "events matching my interests", look up / create / manage
 * an event — not a thin CRUD mirror. Read tasks are anonymous; write tasks
 * require the caller's WorkOS bearer token (threaded in via `ToolContext`),
 * which is forwarded to the app. Every result carries inline HTML (a carousel
 * for many events, a card for one) plus a plain-text fallback.
 *
 * No autonomous/agent tools are exposed yet — that is deliberately future work.
 */

import type { Env } from "../types";
import {
  AppApiError,
  createEvent,
  getEvent,
  listEvents,
  updateEvent,
  type AppEvent,
} from "./app-api";
import { renderEventCard, renderEventCarousel, renderEventsText } from "./render";

/** Per-call context: the bearer token (if any) the MCP client presented. */
export interface ToolContext {
  env: Env;
  token?: string;
}

/** MCP content block union (the subset we emit). */
type ContentBlock =
  | { type: "text"; text: string }
  | { type: "resource"; resource: { uri: string; mimeType: string; text: string } };

export interface ToolResult {
  content: ContentBlock[];
  /**
   * Machine-readable result matching the tool's `outputSchema` (MCP structured
   * output). Lets an agent consume typed event fields instead of scraping the
   * HTML/text. Omitted on error results.
   */
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
}

/** A structured event as advertised by every tool's `outputSchema`. */
export interface StructuredEvent {
  id: string;
  name: string;
  url: string;
  description?: string;
  startDate?: string;
  endDate?: string;
  category?: string;
  attendanceMode?: string;
  status?: string;
  venue?: string;
  city?: string;
  country?: string;
  isOnline: boolean;
  isFree?: boolean;
  price?: number | string;
  priceCurrency?: string;
  ticketUrl?: string;
  attendeeCount?: number;
  maximumAttendeeCapacity?: number;
}

/** JSON-Schema for one {@link StructuredEvent}; reused across tool outputSchemas. */
const EVENT_SCHEMA = {
  type: "object",
  properties: {
    id: { type: "string", description: "Stable event id." },
    name: { type: "string" },
    url: { type: "string", description: "Canonical public event page." },
    description: { type: "string" },
    startDate: { type: "string", description: "ISO-8601 start instant." },
    endDate: { type: "string", description: "ISO-8601 end instant." },
    category: { type: "string" },
    attendanceMode: {
      type: "string",
      description: "schema.org attendance mode (online/offline/mixed).",
    },
    status: { type: "string", description: "Lifecycle status, e.g. published or cancelled." },
    venue: { type: "string" },
    city: { type: "string" },
    country: { type: "string" },
    isOnline: { type: "boolean" },
    isFree: { type: "boolean" },
    price: { type: ["number", "string"] },
    priceCurrency: { type: "string" },
    ticketUrl: { type: "string" },
    attendeeCount: { type: "integer" },
    maximumAttendeeCapacity: { type: "integer" },
  },
  required: ["id", "name", "url"],
} as const;

/** outputSchema for the list tools: `{ events: [...], count }`. */
const EVENT_LIST_OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    events: { type: "array", items: EVENT_SCHEMA },
    count: { type: "integer", description: "Number of events returned." },
  },
  required: ["events", "count"],
} as const;

/** outputSchema for the single-event tools: `{ event }`. */
const EVENT_OUTPUT_SCHEMA = {
  type: "object",
  properties: { event: EVENT_SCHEMA },
  required: ["event"],
} as const;

/**
 * MCP tool behavioural hints (2025-06-18 `annotations`). Hints, not security
 * guarantees — clients use them to label tools and gate confirmations.
 */
export interface ToolAnnotations {
  /** Human-readable display title (mirrors the top-level `title`). */
  title: string;
  /** Tool does not modify its environment. */
  readOnlyHint: boolean;
  /** Tool may perform destructive updates (only meaningful when not read-only). */
  destructiveHint: boolean;
  /** Repeated calls with the same args have no additional effect. */
  idempotentHint: boolean;
  /** Tool interacts with external entities (the live Nhimbe catalogue). */
  openWorldHint: boolean;
}

export interface ToolDefinition {
  name: string;
  /** Human-readable display title (MCP 2025-06-18). */
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
  /** Structured-output contract; `structuredContent` results validate against it. */
  outputSchema: Record<string, unknown>;
  annotations: ToolAnnotations;
  handler: (args: Record<string, unknown>, ctx: ToolContext) => Promise<ToolResult>;
}

const HTML_URI = "ui://nhimbe/events";

/** Canonical public site for event page URLs (events.mukoko.com is the MCP's origin). */
const PUBLIC_SITE = "https://events.mukoko.com";

/** Public event-page URL, preferring the shortest stable handle. */
function eventUrl(ev: AppEvent): string {
  const handle = ev.slug || ev.shortCode || ev.id;
  return `${PUBLIC_SITE}/events/${encodeURIComponent(handle)}`;
}

/** Project the app's event shape onto the stable {@link StructuredEvent} contract. */
function toStructuredEvent(ev: AppEvent): StructuredEvent {
  const mode = ev.eventAttendanceMode;
  return {
    id: ev.id,
    name: ev.name,
    url: eventUrl(ev),
    description: ev.description,
    startDate: ev.startDate,
    endDate: ev.endDate,
    category: ev.category,
    attendanceMode: mode,
    status: ev.eventStatus,
    venue: ev.location?.name,
    city: ev.location?.addressLocality,
    country: ev.location?.addressCountry,
    isOnline: typeof mode === "string" ? /online/i.test(mode) : Boolean(ev.location?.url),
    isFree: ev.offers ? !ev.offers.price || Number(ev.offers.price) === 0 : undefined,
    price: ev.offers?.price,
    priceCurrency: ev.offers?.priceCurrency,
    ticketUrl: ev.offers?.url,
    attendeeCount: ev.attendeeCount,
    maximumAttendeeCapacity: ev.maximumAttendeeCapacity,
  };
}

/** `{ events, count }` structured payload for the list tools. */
function structuredList(events: AppEvent[]): Record<string, unknown> {
  const mapped = events.map(toStructuredEvent);
  return { events: mapped, count: mapped.length };
}

/** `{ event }` structured payload for the single-event tools. */
function structuredOne(event: AppEvent): Record<string, unknown> {
  return { event: toStructuredEvent(event) };
}

function htmlResult(
  text: string,
  html: string,
  structuredContent?: Record<string, unknown>,
): ToolResult {
  return {
    content: [
      { type: "text", text },
      { type: "resource", resource: { uri: HTML_URI, mimeType: "text/html", text: html } },
    ],
    structuredContent,
    isError: false,
  };
}

function errorResult(message: string): ToolResult {
  return { content: [{ type: "text", text: message }], isError: true };
}

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

function num(v: unknown): number | undefined {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : undefined;
}

function bool(v: unknown, fallback = false): boolean {
  return typeof v === "boolean" ? v : fallback;
}

/** Require a bearer token for write tools, with a consistent sign-in message. */
function requireToken(ctx: ToolContext): string {
  if (!ctx.token) {
    throw new AppApiError(
      "This action needs you to be signed in. Connect Nhimbe with your account and try again.",
      401,
    );
  }
  return ctx.token;
}

function summarize(events: AppEvent[], lead: string): string {
  return `${lead}\n\n${renderEventsText(events)}`;
}

export const TOOLS: ToolDefinition[] = [
  {
    name: "events_near_me",
    title: "Find events near me",
    description:
      "Find upcoming Nhimbe events near a place. Pass a city (recommended). Returns a carousel of event cards.",
    annotations: {
      title: "Find events near me",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    inputSchema: {
      type: "object",
      properties: {
        city: { type: "string", description: "City to search in, e.g. \"Harare\"." },
        limit: { type: "integer", description: "Max events to return (default 12).", minimum: 1, maximum: 40 },
      },
    },
    outputSchema: EVENT_LIST_OUTPUT_SCHEMA,
    handler: async (args, ctx) => {
      const city = str(args.city);
      const limit = num(args.limit) ?? 12;
      const events = await listEvents(ctx.env, { city, limit });
      const lead = city ? `Events near ${city}` : "Upcoming events";
      return htmlResult(summarize(events, lead), renderEventCarousel(events, lead), structuredList(events));
    },
  },
  {
    name: "events_matching_interests",
    title: "Find events matching interests",
    description:
      "Find Nhimbe events matching one or more interests/categories (e.g. \"Music\", \"Tech\"). Optionally scope to a city. Returns a carousel.",
    annotations: {
      title: "Find events matching interests",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    inputSchema: {
      type: "object",
      properties: {
        interests: {
          type: "array",
          items: { type: "string" },
          description: "Interest or category names to match.",
        },
        city: { type: "string", description: "Optional city to scope the search to." },
        limit: { type: "integer", description: "Max events to return (default 12).", minimum: 1, maximum: 40 },
      },
      required: ["interests"],
    },
    outputSchema: EVENT_LIST_OUTPUT_SCHEMA,
    handler: async (args, ctx) => {
      const interests = Array.isArray(args.interests)
        ? (args.interests as unknown[]).map(str).filter((s): s is string => Boolean(s))
        : [];
      if (interests.length === 0) return errorResult("Tell me at least one interest to match, e.g. \"Music\".");
      const city = str(args.city);
      const limit = num(args.limit) ?? 12;

      // The app filters one category per call; fan out over interests and merge
      // unique events (preserving first-seen order) up to the limit.
      const seen = new Set<string>();
      const merged: AppEvent[] = [];
      for (const category of interests) {
        const batch = await listEvents(ctx.env, { category, city, limit });
        for (const ev of batch) {
          if (!seen.has(ev.id)) {
            seen.add(ev.id);
            merged.push(ev);
          }
        }
        if (merged.length >= limit) break;
      }
      const events = merged.slice(0, limit);
      const lead = `Events matching ${interests.join(", ")}${city ? ` in ${city}` : ""}`;
      return htmlResult(summarize(events, lead), renderEventCarousel(events, lead), structuredList(events));
    },
  },
  {
    name: "get_event",
    title: "Get an event",
    description: "Look up a single Nhimbe event by id, slug, or short code. Returns one event card.",
    annotations: {
      title: "Get an event",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    inputSchema: {
      type: "object",
      properties: {
        eventId: { type: "string", description: "Event id, slug, or short code." },
      },
      required: ["eventId"],
    },
    outputSchema: EVENT_OUTPUT_SCHEMA,
    handler: async (args, ctx) => {
      const eventId = str(args.eventId);
      if (!eventId) return errorResult("Provide an event id, slug, or short code.");
      const event = await getEvent(ctx.env, eventId);
      if (!event) return errorResult(`No event found for "${eventId}".`);
      return htmlResult(
        `${event.name} — ${event.date?.full ?? event.startDate ?? ""}`.trim(),
        renderEventCard(event),
        structuredOne(event),
      );
    },
  },
  {
    name: "create_event",
    title: "Create an event",
    description:
      "Create a new Nhimbe event as the signed-in host. Requires the caller to be authenticated with WorkOS. Returns the created event card.",
    annotations: {
      title: "Create an event",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Event title." },
        description: { type: "string", description: "Event description." },
        startDate: { type: "string", description: "ISO-8601 start instant, e.g. 2026-08-01T18:00:00Z." },
        endDate: { type: "string", description: "ISO-8601 end instant (optional; defaults to start + 1h)." },
        isOnline: { type: "boolean", description: "True for an online event." },
        venue: { type: "string", description: "Venue name (in-person events)." },
        streetAddress: { type: "string" },
        addressLocality: { type: "string", description: "City." },
        addressCountry: { type: "string" },
        meetingUrl: { type: "string", description: "Join URL (online events)." },
        category: { type: "string", description: "Primary category, e.g. \"Music\"." },
        isFree: { type: "boolean", description: "True if the event is free (default true)." },
        ticketUrl: { type: "string", description: "External ticketing URL (paid events)." },
        maximumAttendeeCapacity: { type: "integer", minimum: 1 },
        visibility: { type: "string", enum: ["public", "private"], description: "Defaults to public." },
      },
      required: ["name", "startDate"],
    },
    outputSchema: EVENT_OUTPUT_SCHEMA,
    handler: async (args, ctx) => {
      const token = requireToken(ctx);
      const name = str(args.name);
      const startDate = str(args.startDate);
      if (!name) return errorResult("An event name is required.");
      if (!startDate) return errorResult("A start date (ISO-8601) is required.");

      const isOnline = bool(args.isOnline);
      const payload: Record<string, unknown> = {
        name,
        description: str(args.description) ?? "",
        startDate,
        endDate: str(args.endDate) ?? null,
        isOnline,
        venue: str(args.venue),
        streetAddress: str(args.streetAddress),
        addressLocality: str(args.addressLocality),
        addressCountry: str(args.addressCountry),
        meetingUrl: str(args.meetingUrl) ?? null,
        category: str(args.category) ?? null,
        isFree: bool(args.isFree, true),
        ticketUrl: str(args.ticketUrl) ?? null,
        maximumAttendeeCapacity: num(args.maximumAttendeeCapacity) ?? null,
        visibility: str(args.visibility) === "private" ? "private" : "public",
        hostMode: "person",
      };
      const event = await createEvent(ctx.env, token, payload);
      return htmlResult(`Created "${event.name}".`, renderEventCard(event), structuredOne(event));
    },
  },
  {
    name: "update_event",
    title: "Update or manage an event",
    description:
      "Update or manage an event you host — edit details or change its status (e.g. cancel). Requires WorkOS authentication. Returns the updated event card.",
    annotations: {
      title: "Update or manage an event",
      readOnlyHint: false,
      // Can change lifecycle status (e.g. cancel), so treat as destructive.
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: true,
    },
    inputSchema: {
      type: "object",
      properties: {
        eventId: { type: "string", description: "Id of the event to update." },
        name: { type: "string" },
        description: { type: "string" },
        startDate: { type: "string", description: "ISO-8601 start instant." },
        endDate: { type: "string", description: "ISO-8601 end instant." },
        status: {
          type: "string",
          enum: ["published", "cancelled", "draft"],
          description: "New lifecycle status (e.g. \"cancelled\" to cancel the event).",
        },
      },
      required: ["eventId"],
    },
    outputSchema: EVENT_OUTPUT_SCHEMA,
    handler: async (args, ctx) => {
      const token = requireToken(ctx);
      const eventId = str(args.eventId);
      if (!eventId) return errorResult("Provide the id of the event to update.");

      const patch: Record<string, unknown> = {};
      if (str(args.name)) patch.name = str(args.name);
      if (str(args.description) !== undefined) patch.description = str(args.description);
      if (str(args.startDate)) patch.startDate = str(args.startDate);
      if (str(args.endDate)) patch.endDate = str(args.endDate);
      if (str(args.status)) patch.status = str(args.status);
      if (Object.keys(patch).length === 0) {
        return errorResult("Nothing to update — pass at least one field to change.");
      }

      const event = await updateEvent(ctx.env, token, eventId, patch);
      const verb = patch.status === "cancelled" ? "Cancelled" : "Updated";
      return htmlResult(`${verb} "${event.name}".`, renderEventCard(event), structuredOne(event));
    },
  },
];

const TOOL_BY_NAME = new Map(TOOLS.map((t) => [t.name, t]));

/** Public tool descriptors for `tools/list` (no handler). */
export function listToolDescriptors() {
  return TOOLS.map(({ name, title, description, inputSchema, outputSchema, annotations }) => ({
    name,
    title,
    description,
    inputSchema,
    outputSchema,
    annotations,
  }));
}

/** Dispatch a `tools/call`. Maps AppApiError to a clean, user-facing error result. */
export async function callTool(
  name: string,
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolResult> {
  const tool = TOOL_BY_NAME.get(name);
  if (!tool) return errorResult(`Unknown tool: ${name}`);
  try {
    return await tool.handler(args ?? {}, ctx);
  } catch (err) {
    if (err instanceof AppApiError) return errorResult(err.message);
    const message = err instanceof Error ? err.message : "Something went wrong.";
    return errorResult(message);
  }
}
