/**
 * GET /calendars/:slug/ics — the calendar's upcoming events as a
 * `text/calendar` VCALENDAR feed (NYU-25), so followers can subscribe from
 * Apple/Google/Outlook. Public and unlisted calendars only — private
 * calendars 404 (a feed URL has no session to gate on).
 *
 * Node runtime: the MongoDB driver requires Node, not edge.
 */

import { getCalendarBySlug, listCalendarEventDocs } from "@/lib/mongo/calendars";
import { buildCalendarIcs, type IcsEventInput } from "@/lib/ics";
import { resolveEventCity } from "@/lib/mongo/event-filters";
import { SITE_URL } from "@/lib/site-url";
import type { EventDoc } from "@/lib/mongo/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Human LOCATION line from the event's embedded schema.org location. */
function eventLocationText(doc: EventDoc): string | null {
  const location = doc.location;
  if (!location) return null;
  if (location["@type"] === "VirtualLocation") {
    return typeof location.url === "string" && location.url ? location.url : "Online";
  }
  const name = typeof location.name === "string" ? location.name : "";
  // Canonical-first locality resolution (nested, then legacy flat) — the same
  // path the discovery counts and drill-downs use (see event-filters.ts).
  const locality = resolveEventCity(doc) ?? "";
  const parts = [name, locality].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : null;
}

function toIcsEvent(doc: EventDoc): IcsEventInput {
  return {
    uid: doc.iCalUid,
    start: doc.startDate,
    // endDate may be absent on legacy docs; the ICS builder emits a
    // DTSTART-only VEVENT rather than failing the whole feed (L3).
    end: doc.endDate ?? null,
    summary: doc.name,
    location: eventLocationText(doc),
    url: `${SITE_URL}/events/${doc._id}`,
    description: doc.description ?? null,
  };
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;

  try {
    const calendar = await getCalendarBySlug(slug);
    if (!calendar || calendar.visibility === "private") {
      return new Response("Calendar not found", { status: 404 });
    }

    const docs = await listCalendarEventDocs(calendar._id, 250);
    const ics = buildCalendarIcs({
      name: calendar.name,
      description: calendar.description ?? null,
      events: docs.map(toIcsEvent),
    });

    return new Response(ics, {
      status: 200,
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": `inline; filename="${calendar.slug}.ics"`,
        // Feeds are polled by calendar apps — short shared cache, no auth.
        "Cache-Control": "public, max-age=300",
      },
    });
  } catch (err) {
    console.error(`[mukoko] GET /calendars/${slug}/ics failed`, err);
    return new Response("Failed to build calendar feed", { status: 500 });
  }
}
