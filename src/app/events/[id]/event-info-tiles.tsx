"use client";

import Link from "next/link";
import { Clock, MapPin, Cloud, ArrowRight } from "lucide-react";
import type { Event } from "@/lib/api";

/**
 * 3-up info tiles — When / Where / Weather — from the Nhimbe.html prototype.
 *
 * Visual treatment: a row of three pill-rounded mini-cards in a muted
 * container, each with a small icon, an uppercase caption, and a body line.
 * The tile contents are derived from event fields you'd want at a glance
 * before scrolling: time + duration, venue + city, then weather (rendered
 * lazily inside EventWeather and only when a place + date are available).
 *
 * Data sources (verified against platform-db schema):
 *   When  — events.event.{startdate, duration, timezone}
 *   Where — events.event.{place_id → places.places.{name,address_locality},
 *           location jsonb fallback for venue.name when place_id is null}
 *   Weather — weather.weather_forecast(place_id, forecast_date) lookup
 *           handled by the existing EventWeather component
 */

interface EventInfoTilesProps {
  event: Event;
  weatherSlot?: React.ReactNode;
}

function formatTimeRange(startISO: string, endISO?: string, tz?: string): string {
  const opts: Intl.DateTimeFormatOptions = {
    hour: "numeric",
    minute: "2-digit",
    timeZone: tz,
  };
  const start = new Date(startISO);
  if (!endISO) return start.toLocaleTimeString(undefined, opts);
  const end = new Date(endISO);
  return `${start.toLocaleTimeString(undefined, opts)} – ${end.toLocaleTimeString(undefined, opts)}`;
}

// Render an ISO-8601 duration like "PT2H30M" → "2h 30m". Light, no library.
function formatIsoDuration(iso?: string): string | null {
  if (!iso || !iso.startsWith("PT")) return null;
  const h = iso.match(/(\d+)H/)?.[1];
  const m = iso.match(/(\d+)M/)?.[1];
  if (!h && !m) return null;
  return [h ? `${h}h` : null, m ? `${m}m` : null].filter(Boolean).join(" ");
}

export function EventInfoTiles({ event, weatherSlot }: EventInfoTilesProps) {
  const isOnline = event.eventAttendanceMode === "OnlineEventAttendanceMode";
  const timeRange = formatTimeRange(event.startDate, event.endDate, event.timezone);
  const duration = formatIsoDuration(event.duration);
  const venue = event.location.name || (isOnline ? "Online" : "TBA");
  const locality = event.location.addressLocality;

  return (
    <div
      data-slot="event-info-tiles"
      className="grid grid-cols-3 gap-0 rounded-[var(--radius-lg)] bg-muted p-3 mb-6"
    >
      <Tile
        Icon={Clock}
        caption="When"
        primary={event.date.day ? `${event.date.month} ${event.date.day}` : event.date.full || ""}
        secondary={duration ? `${timeRange} · ${duration}` : timeRange}
        tint="var(--nh-lead)"
      />
      <Tile
        Icon={MapPin}
        caption={isOnline ? "Online" : "Where"}
        primary={venue}
        secondary={isOnline ? (event.meetingPlatform || "Virtual") : (locality || "")}
        tint="var(--nh-secondary)"
        borderLeft
      />
      <div className="flex flex-col gap-1.5 px-3" style={{ borderLeft: "1px solid var(--border)" }}>
        <span className="inline-flex items-center gap-1.5" style={{ color: "var(--nh-accent)" }}>
          <Cloud className="w-3.5 h-3.5" strokeWidth={2.2} aria-hidden />
          <span className="text-[10px] font-semibold uppercase tracking-[0.04em] text-muted-foreground">
            Weather
          </span>
        </span>
        <div className="text-sm text-foreground">
          {weatherSlot ?? <span className="text-muted-foreground">—</span>}
        </div>
      </div>
    </div>
  );
}

interface TileProps {
  Icon: React.ComponentType<{ className?: string; strokeWidth?: number; "aria-hidden"?: boolean }>;
  caption: string;
  primary: string;
  secondary?: string;
  tint: string;
  borderLeft?: boolean;
}

function Tile({ Icon, caption, primary, secondary, tint, borderLeft }: TileProps) {
  return (
    <div
      className="flex flex-col gap-1.5 px-3"
      style={{ borderLeft: borderLeft ? "1px solid var(--border)" : undefined }}
    >
      <span className="inline-flex items-center gap-1.5" style={{ color: tint }}>
        <Icon className="w-3.5 h-3.5" strokeWidth={2.2} aria-hidden />
        <span className="text-[10px] font-semibold uppercase tracking-[0.04em] text-muted-foreground">
          {caption}
        </span>
      </span>
      <span className="font-serif text-base font-semibold leading-tight text-foreground line-clamp-1">
        {primary}
      </span>
      {secondary && <span className="text-[11px] text-muted-foreground line-clamp-1">{secondary}</span>}
    </div>
  );
}

/**
 * Live attendance pulse strip — signature visual from Nhimbe.html.
 * 28 dots filled left-to-right by the attendee/capacity ratio. When capacity
 * is unbounded we cap the strip at the attendee count.
 */
export function EventPulseStrip({ event }: { event: Event }) {
  const DOT_COUNT = 28;
  const attendees = event.attendeeCount ?? 0;
  const capacity = event.maximumAttendeeCapacity ?? Math.max(attendees, DOT_COUNT);
  const filled = Math.min(DOT_COUNT, Math.round((attendees / Math.max(capacity, 1)) * DOT_COUNT));
  const atCapacity = !!event.maximumAttendeeCapacity && attendees >= event.maximumAttendeeCapacity;

  return (
    <div
      data-slot="event-pulse-strip"
      className="flex items-center gap-3 mb-5"
      aria-label={`${attendees}${event.maximumAttendeeCapacity ? ` of ${event.maximumAttendeeCapacity}` : ""} confirmed`}
    >
      <span className="inline-flex items-center gap-[3px]" aria-hidden>
        {Array.from({ length: DOT_COUNT }).map((_, i) => (
          <span
            key={i}
            className="rounded-full"
            style={{
              width: 5,
              height: 5,
              background:
                i < filled
                  ? "var(--nh-lead)"
                  : "color-mix(in srgb, var(--nh-lead) 22%, transparent)",
            }}
          />
        ))}
      </span>
      <span className="text-xs font-semibold text-foreground">
        {attendees}
        {event.maximumAttendeeCapacity ? <span className="text-muted-foreground"> / {event.maximumAttendeeCapacity}</span> : null}
      </span>
      {atCapacity && (
        <span
          className="text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full"
          style={{ background: "var(--nh-lead-soft)", color: "var(--nh-lead)" }}
        >
          At capacity
        </span>
      )}
    </div>
  );
}

/**
 * Circle CTA — surfaces when the event is linked to a circle via
 * events.event.event_circle_id. Renders nothing when the link is absent.
 */
export function EventCircleCta({ event }: { event: Event }) {
  if (!event.eventCircleId) return null;
  return (
    <Link
      href={`/circles/${event.eventCircleId}`}
      data-slot="event-circle-cta"
      className="inline-flex items-center gap-2 mt-3 px-4 h-10 rounded-full text-sm font-semibold transition-colors"
      style={{ background: "var(--nh-lead-soft)", color: "var(--nh-lead)" }}
    >
      View the circle
      <ArrowRight className="w-4 h-4" aria-hidden />
    </Link>
  );
}

/**
 * Contributions board — chips derived from events.event.contributor jsonb.
 * The shape on the platform DB is flexible (array of strings, array of
 * objects with {name}, or a free-form object); we narrow defensively.
 */
export function EventContributionsBoard({ event }: { event: Event }) {
  const chips = normaliseContributors(event.contributor);
  if (chips.length === 0) return null;
  return (
    <section data-slot="event-contributions" className="mt-8">
      <h3 className="text-sm font-medium text-muted-foreground mb-3">Contributions board</h3>
      <ul className="flex flex-wrap gap-2">
        {chips.map((c, i) => (
          <li
            key={i}
            className="inline-flex items-center gap-1.5 px-3 h-8 rounded-full border text-xs"
            style={{ borderColor: "var(--border)" }}
          >
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: "var(--nh-accent)" }} />
            <span className="font-medium">{c}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function normaliseContributors(raw: unknown): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return raw
      .map((c) => {
        if (typeof c === "string") return c;
        if (c && typeof c === "object" && "name" in c) {
          const name = (c as { name?: unknown }).name;
          return typeof name === "string" ? name : null;
        }
        return null;
      })
      .filter((s): s is string => !!s);
  }
  if (typeof raw === "object" && raw !== null) {
    return Object.entries(raw as Record<string, unknown>)
      .map(([k, v]) => (typeof v === "string" ? `${k}: ${v}` : k))
      .slice(0, 12);
  }
  return [];
}
