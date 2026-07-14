import Link from "next/link";
import { CalendarRange, Rss, Users } from "lucide-react";
import { EventThemeWrapper } from "@/app/events/[id]/event-theme-wrapper";
import { NyuchiTimeline, type TimelineItem } from "@/components/ui/nyuchi-timeline";
import { FollowButton } from "./follow-button";
import { getTheme } from "@/lib/themes";
import { categoryToMineral } from "@/lib/category-mineral";
import { getMediaUrl, type Event } from "@/lib/api";

/**
 * Calendar page body (NYU-25) — presentational, rendered by the SSR route.
 *
 * A calendar is a followable curated EVENT STREAM (the Luma pattern), not a
 * community: the page leads with identity (cover wash, name, curator,
 * follower count, Follow pill, .ics subscribe) and then IS the timeline —
 * the calendar's upcoming events as the NyuchiTimeline drill-down. When the
 * calendar belongs to a circle, a small "from <circle>" line links to the
 * community without conflating the two.
 */

export interface CalendarViewData {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  followerCount: number;
  eventCount: number;
  visibility: "public" | "unlisted" | "private";
  /** Washed palette id — grounds the page via EventThemeWrapper. */
  theme: string | null;
  /** Curating entity's display name. */
  ownerName: string | null;
  /** Owning circle, when the calendar belongs to a community. */
  circle: { id: string; name: string } | null;
}

interface CalendarViewProps {
  calendar: CalendarViewData;
  events: Event[];
  isAuthenticated: boolean;
  initialFollowing: boolean;
}

function toTimelineItem(event: Event): TimelineItem {
  return {
    id: event.id,
    date: event.startDate,
    time: event.date.time,
    title: event.name,
    host: event.organizer?.name,
    location: event.location.name || event.location.addressLocality,
    attendeeCount: event.attendeeCount,
    thumbnail: event.image ? getMediaUrl(event.image) : undefined,
    href: `/events/${event.id}`,
    mineral: categoryToMineral(event.category),
    category: event.category,
  };
}

export function CalendarView({
  calendar,
  events,
  isAuthenticated,
  initialFollowing,
}: CalendarViewProps) {
  const theme = getTheme(calendar.theme ?? undefined);

  return (
    <EventThemeWrapper themeId={calendar.theme ?? undefined}>
      <div className="max-w-200 mx-auto px-6 py-8 md:py-10">
        {/* Cover band — the calendar's washed theme gradient. */}
        <div
          className="h-36 md:h-44 rounded-[var(--radius-xl,17px)] mb-6"
          style={{ background: theme.gradient }}
          aria-hidden
          data-slot="calendar-cover"
        />

        <header className="mb-8 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-[13px] font-medium uppercase tracking-wide text-muted-foreground">
              <CalendarRange className="size-3.5" aria-hidden />
              Calendar
              {calendar.visibility === "unlisted" && (
                <span className="rounded-full bg-foreground/5 px-2 py-0.5 normal-case tracking-normal">
                  Unlisted
                </span>
              )}
              {calendar.visibility === "private" && (
                <span className="rounded-full bg-foreground/5 px-2 py-0.5 normal-case tracking-normal">
                  Private
                </span>
              )}
            </p>
            <h1 className="mt-1 font-serif text-3xl md:text-4xl font-bold leading-tight tracking-tight text-foreground">
              {calendar.name}
            </h1>
            {calendar.circle && (
              <p className="mt-1 text-sm text-muted-foreground">
                from{" "}
                <Link
                  href={`/circles/${calendar.circle.id}`}
                  className="font-medium text-primary hover:underline"
                >
                  {calendar.circle.name}
                </Link>
              </p>
            )}
            {calendar.description && (
              <p className="mt-2 max-w-150 text-text-secondary">{calendar.description}</p>
            )}
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-muted-foreground">
              {calendar.ownerName && <span>Curated by {calendar.ownerName}</span>}
              <span className="inline-flex items-center gap-1">
                <Users className="size-3.5" aria-hidden />
                {calendar.followerCount} {calendar.followerCount === 1 ? "follower" : "followers"}
              </span>
              <span>
                {calendar.eventCount} {calendar.eventCount === 1 ? "event" : "events"}
              </span>
            </div>
          </div>

          <div className="flex shrink-0 flex-col items-start gap-2">
            <FollowButton
              calendarId={calendar.id}
              slug={calendar.slug}
              isAuthenticated={isAuthenticated}
              initialFollowing={initialFollowing}
              initialFollowerCount={calendar.followerCount}
            />
            <a
              href={`/calendars/${calendar.slug}/ics`}
              className="inline-flex h-9 items-center gap-1.5 rounded-full bg-foreground/5 px-3.5 text-sm font-medium text-foreground/70 transition-colors hover:bg-foreground/10 hover:text-foreground"
            >
              <Rss className="size-3.5" aria-hidden />
              Subscribe (.ics)
            </a>
          </div>
        </header>

        {/* The stream itself — upcoming events as the timeline drill-down. */}
        <section aria-label="Upcoming events on this calendar">
          <NyuchiTimeline
            items={events.map(toTimelineItem)}
            emptyState={
              <p className="text-sm text-text-secondary">
                No upcoming events on this calendar yet — follow it and be first to know.
              </p>
            }
          />
        </section>
      </div>
    </EventThemeWrapper>
  );
}
