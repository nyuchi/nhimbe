"use client";

import Link from "next/link";
import Image from "next/image";
import { formatEventDateTime } from "@/lib/timezone";

interface EventCardHorizontalProps {
  id: string;
  title: string;
  date: {
    day: string;
    month: string;
    full?: string;
    time?: string;
  };
  location: {
    name?: string;
    venue?: string;
    addressLocality?: string;
    addressCountry?: string;
  };
  coverImage?: string;
  coverGradient?: string;
  /** Current confirmed attendees — drives the pulse-dot strip. */
  attendeeCount?: number;
  /** Maximum capacity — when set, dots show fill ratio. */
  maximumAttendeeCapacity?: number;
}

// Signature visual from Nhimbe.html: a row of small dots representing seats,
// filled left-to-right by the current attendee count. Tells you fullness at a
// glance without parsing "27/50". 16 dots is the compact horizontal-card scale.
function PulseDotStrip({ filled, total }: { filled: number; total: number }) {
  return (
    <span
      data-slot="pulse-dots"
      aria-label={`${filled} of ${total} confirmed`}
      className="inline-flex items-center gap-[3px]"
    >
      {Array.from({ length: total }).map((_, i) => (
        <span
          key={i}
          aria-hidden
          className="rounded-full"
          style={{
            width: 4,
            height: 4,
            background: i < filled ? "var(--nh-lead)" : "color-mix(in srgb, var(--nh-lead) 22%, transparent)",
          }}
        />
      ))}
    </span>
  );
}

export function EventCardHorizontal({
  id,
  title,
  date,
  location,
  coverImage,
  coverGradient,
  attendeeCount,
  maximumAttendeeCapacity,
}: EventCardHorizontalProps) {
  // Format the datetime for display
  const dateTime = date.full
    ? formatEventDateTime(date.full, date.time)
    : `${date.month} ${date.day}${date.time ? `, ${date.time}` : ""}`;

  const venueDisplay = (location.name || location.venue)
    ? `${location.name ?? location.venue}`
    : `${location.addressLocality}, ${location.addressCountry}`;

  // Only render the pulse strip when we have something meaningful to show.
  const DOT_COUNT = 16;
  const showPulse = typeof attendeeCount === "number" && attendeeCount >= 0;
  const capacityForFill = maximumAttendeeCapacity ?? Math.max(attendeeCount ?? 0, DOT_COUNT);
  const filled = showPulse
    ? Math.min(DOT_COUNT, Math.round(((attendeeCount ?? 0) / Math.max(capacityForFill, 1)) * DOT_COUNT))
    : 0;

  return (
    <Link data-slot="event-card-horizontal" href={`/events/${id}`} className="block group">
      <div className="flex gap-4 p-2 -m-2 rounded-xl hover:bg-surface/50 transition-colors">
        {/* Square Image Thumbnail */}
        <div
          data-slot="event-card-horizontal-thumbnail"
          className="w-[72px] h-[72px] shrink-0 rounded-lg overflow-hidden"
          style={
            !coverImage
              ? { background: coverGradient || "linear-gradient(135deg, #004D40, #00796B)" }
              : undefined
          }
        >
          {coverImage && (
            <Image
              src={coverImage}
              alt={title}
              width={72}
              height={72}
              className="w-full h-full object-cover"
            />
          )}
        </div>

        {/* Event Details */}
        <div data-slot="event-card-horizontal-body" className="flex-1 min-w-0 py-0.5">
          {/* Date/Time */}
          <p className="text-sm text-text-secondary mb-1">{dateTime}</p>

          {/* Title */}
          <h3 className="font-semibold text-foreground leading-snug mb-1 group-hover:text-primary transition-colors line-clamp-2">
            {title}
          </h3>

          {/* Venue */}
          <p className="text-sm text-text-tertiary truncate">{venueDisplay}</p>

          {/* Pulse strip — opt-in via attendeeCount prop */}
          {showPulse && (
            <div className="mt-2 flex items-center gap-2">
              <PulseDotStrip filled={filled} total={DOT_COUNT} />
              <span className="text-[11px] font-semibold text-muted-foreground">
                {attendeeCount}
                {maximumAttendeeCapacity ? `/${maximumAttendeeCapacity}` : ""}
              </span>
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}
