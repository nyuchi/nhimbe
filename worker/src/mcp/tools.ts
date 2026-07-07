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
  isError?: boolean;
}

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  handler: (args: Record<string, unknown>, ctx: ToolContext) => Promise<ToolResult>;
}

const HTML_URI = "ui://nhimbe/events";

function htmlResult(text: string, html: string, isError = false): ToolResult {
  return {
    content: [
      { type: "text", text },
      { type: "resource", resource: { uri: HTML_URI, mimeType: "text/html", text: html } },
    ],
    isError,
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
      "This action needs you to be signed in. Connect nhimbe with your account and try again.",
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
    description:
      "Find upcoming nhimbe events near a place. Pass a city (recommended). Returns a carousel of event cards.",
    inputSchema: {
      type: "object",
      properties: {
        city: { type: "string", description: "City to search in, e.g. \"Harare\"." },
        limit: { type: "integer", description: "Max events to return (default 12).", minimum: 1, maximum: 40 },
      },
    },
    handler: async (args, ctx) => {
      const city = str(args.city);
      const limit = num(args.limit) ?? 12;
      const events = await listEvents(ctx.env, { city, limit });
      const lead = city ? `Events near ${city}` : "Upcoming events";
      return htmlResult(summarize(events, lead), renderEventCarousel(events, lead));
    },
  },
  {
    name: "events_matching_interests",
    description:
      "Find nhimbe events matching one or more interests/categories (e.g. \"Music\", \"Tech\"). Optionally scope to a city. Returns a carousel.",
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
      return htmlResult(summarize(events, lead), renderEventCarousel(events, lead));
    },
  },
  {
    name: "get_event",
    description: "Look up a single nhimbe event by id, slug, or short code. Returns one event card.",
    inputSchema: {
      type: "object",
      properties: {
        eventId: { type: "string", description: "Event id, slug, or short code." },
      },
      required: ["eventId"],
    },
    handler: async (args, ctx) => {
      const eventId = str(args.eventId);
      if (!eventId) return errorResult("Provide an event id, slug, or short code.");
      const event = await getEvent(ctx.env, eventId);
      if (!event) return errorResult(`No event found for "${eventId}".`);
      return htmlResult(
        `${event.name} — ${event.date?.full ?? event.startDate ?? ""}`.trim(),
        renderEventCard(event),
      );
    },
  },
  {
    name: "create_event",
    description:
      "Create a new nhimbe event as the signed-in host. Requires the caller to be authenticated with WorkOS. Returns the created event card.",
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
      return htmlResult(`Created "${event.name}".`, renderEventCard(event));
    },
  },
  {
    name: "update_event",
    description:
      "Update or manage an event you host — edit details or change its status (e.g. cancel). Requires WorkOS authentication. Returns the updated event card.",
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
      return htmlResult(`${verb} "${event.name}".`, renderEventCard(event));
    },
  },
];

const TOOL_BY_NAME = new Map(TOOLS.map((t) => [t.name, t]));

/** Public tool descriptors for `tools/list` (no handler). */
export function listToolDescriptors() {
  return TOOLS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema }));
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
