"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarDays, Compass, MapPin, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { NyuchiTimeline, type TimelineItem } from "@/components/ui/nyuchi-timeline";
import { NyuchiEmptyState } from "@/components/ui/nyuchi-empty-state";
import { categoryToMineral } from "@/lib/category-mineral";
import { getMediaUrl, type Event } from "@/lib/api";
import type { MyEventsResult } from "@/app/actions/my-events";

/**
 * Authenticated home — "Your events" (Luma pattern, NYU-24 IA refresh).
 *
 * The signed-in home is the member's own calendar, not a discovery feed:
 * an Upcoming/Past segmented control over a timeline of their RSVPs and
 * hosted gatherings, with the branded empty state pointing at Discover /
 * Host when there's nothing on the calendar. Data arrives server-side from
 * page.tsx (SSR read of Mongo via getMyEvents) — this component only owns
 * the tab state.
 */

interface HomeYourEventsProps {
  events: MyEventsResult;
  userFirstName?: string | null;
}

function toTimelineItem(event: Event, hosting: boolean): TimelineItem {
  return {
    id: event.id,
    date: event.startDate,
    time: event.date.time,
    title: event.name,
    host: hosting ? "You're hosting" : event.organizer?.name,
    location: event.location.name || event.location.addressLocality,
    attendeeCount: event.attendeeCount,
    thumbnail: event.image ? getMediaUrl(event.image) : undefined,
    href: hosting ? `/events/${event.id}/manage` : `/events/${event.id}`,
    mineral: categoryToMineral(event.category),
    category: event.category,
  };
}

export function HomeYourEvents({ events, userFirstName }: HomeYourEventsProps) {
  const router = useRouter();
  const [tab, setTab] = useState<"upcoming" | "past">("upcoming");

  const hostingIds = useMemo(() => new Set(events.hosting.map((e) => e.id)), [events.hosting]);

  const upcomingItems = useMemo(() => {
    const merged = [
      ...events.hosting.map((e) => toTimelineItem(e, true)),
      ...events.attending.map((e) => toTimelineItem(e, false)),
    ];
    return merged.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [events.attending, events.hosting]);

  const pastItems = useMemo(
    () =>
      events.past
        .map((e) => toTimelineItem(e, hostingIds.has(e.id)))
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
    [events.past, hostingIds],
  );

  const emptyState = (
    <NyuchiEmptyState
      icon={<CalendarDays />}
      title="Nothing on your calendar yet"
      description="Find a gathering that moves you, or bring people together yourself."
      actionLabel="Discover gatherings"
      onAction={() => router.push("/discover")}
      secondaryLabel="Host a gathering"
      onSecondary={() => router.push("/events/create")}
    />
  );

  return (
    <div className="min-h-screen">
      <div className="max-w-200 mx-auto px-6 py-8 md:py-12">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-6">
          <div>
            <h1 className="font-serif text-3xl md:text-4xl font-bold text-foreground leading-tight tracking-tight">
              Your events
            </h1>
            <p className="text-text-secondary mt-1.5">
              {userFirstName ? `Welcome back, ${userFirstName}. ` : ""}
              Gatherings you&apos;re attending or hosting.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button asChild variant="outline" className="rounded-full">
              <Link href="/discover">
                <Compass className="w-4 h-4" aria-hidden />
                Discover
              </Link>
            </Button>
            <Button asChild className="rounded-full">
              <Link href="/events/create">
                <Plus className="w-4 h-4" aria-hidden />
                Host
              </Link>
            </Button>
          </div>
        </div>

        {/* Upcoming / Past segmented control */}
        <Tabs value={tab} onValueChange={(v) => setTab(v as "upcoming" | "past")}>
          <TabsList className="mb-6">
            <TabsTrigger value="upcoming">
              Upcoming{upcomingItems.length > 0 ? ` (${upcomingItems.length})` : ""}
            </TabsTrigger>
            <TabsTrigger value="past">
              Past{pastItems.length > 0 ? ` (${pastItems.length})` : ""}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="upcoming">
            {upcomingItems.length > 0 ? <NyuchiTimeline items={upcomingItems} /> : emptyState}
          </TabsContent>
          <TabsContent value="past">
            {pastItems.length > 0 ? (
              <NyuchiTimeline items={pastItems} />
            ) : (
              <NyuchiEmptyState
                icon={<CalendarDays />}
                title="No past events yet"
                description="Gatherings you've attended or hosted will appear here."
                actionLabel="Discover gatherings"
                onAction={() => router.push("/discover")}
              />
            )}
          </TabsContent>
        </Tabs>

        {/* Quiet secondary navigation */}
        <nav aria-label="Quick links" className="mt-8 flex flex-wrap items-center gap-2">
          {[
            { href: "/calendar", label: "Calendar", Icon: CalendarDays },
            { href: "/map", label: "Near me", Icon: MapPin },
            { href: "/my-events", label: "My tickets", Icon: CalendarDays },
          ].map(({ href, label, Icon }) => (
            <Link
              key={href}
              href={href}
              className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-full bg-foreground/5 text-sm font-medium text-foreground/70 hover:bg-foreground/10 hover:text-foreground transition-colors"
            >
              <Icon className="w-3.5 h-3.5" aria-hidden />
              {label}
            </Link>
          ))}
        </nav>
      </div>
    </div>
  );
}
