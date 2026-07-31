"use client";

import { useEffect, useMemo, useState } from "react";
import { LayoutGrid, Rows3, CalendarRange, ArrowUpDown, Users, Clock } from "lucide-react";
import { NyuchiListingCard } from "@/components/ui/nyuchi-listing-card";
import { NyuchiTimeline, type TimelineItem } from "@/components/ui/nyuchi-timeline";
import { NyuchiEmptyState } from "@/components/ui/nyuchi-empty-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { categoryToMineral } from "@/lib/category-mineral";
import { getMediaUrl, type Event } from "@/lib/api";

type ViewMode = "card" | "table" | "timeline";
type SortKey = "name" | "date" | "attendees";
type SortDir = "asc" | "desc";

const VIEW_STORAGE_KEY = "nhimbe:my-events:hosting-view";
const VIEWS: { id: ViewMode; label: string; icon: typeof LayoutGrid }[] = [
  { id: "card", label: "Card", icon: LayoutGrid },
  { id: "table", label: "Table", icon: Rows3 },
  { id: "timeline", label: "Timeline", icon: CalendarRange },
];

interface HostingViewProps {
  events: Event[];
}

/** Simple lifecycle label from the schema.org eventStatus string. */
function statusLabel(event: Event): { label: string; variant: "default" | "secondary" | "destructive" } {
  const status = (event.eventStatus ?? "").replace(/^https?:\/\/schema\.org\//, "");
  if (status === "EventCancelled") return { label: "Cancelled", variant: "destructive" };
  if (status === "EventPostponed") return { label: "Postponed", variant: "secondary" };
  if (event.isPublished === false) return { label: "Draft", variant: "secondary" };
  return { label: "Published", variant: "default" };
}

function toTimelineItem(event: Event): TimelineItem {
  return {
    id: event.id,
    date: event.startDate,
    time: event.date.time,
    title: event.name,
    host: "You're hosting",
    location: event.location.name || event.location.addressLocality,
    attendeeCount: event.attendeeCount,
    thumbnail: event.image ? getMediaUrl(event.image) : undefined,
    href: `/events/${event.id}`,
    mineral: categoryToMineral(event.category),
    category: event.category,
  };
}

/**
 * View-switcher for the "Hosting" tab — a Notion-style multi-view of the
 * host's own events: Card (the original grid), Table (sortable columns) and
 * Timeline (date-rail list). The chosen view persists in localStorage so it
 * sticks across visits.
 */
export function HostingView({ events }: HostingViewProps) {
  const [view, setView] = useState<ViewMode>("card");
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  useEffect(() => {
    const stored = window.localStorage.getItem(VIEW_STORAGE_KEY);
    if (stored === "card" || stored === "table" || stored === "timeline") setView(stored);
  }, []);

  const setViewAndPersist = (next: ViewMode) => {
    setView(next);
    window.localStorage.setItem(VIEW_STORAGE_KEY, next);
  };

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const sortedEvents = useMemo(() => {
    const sorted = [...events].sort((a, b) => {
      switch (sortKey) {
        case "name":
          return a.name.localeCompare(b.name);
        case "attendees":
          return a.attendeeCount - b.attendeeCount;
        case "date":
        default:
          return new Date(a.startDate).getTime() - new Date(b.startDate).getTime();
      }
    });
    return sortDir === "asc" ? sorted : sorted.reverse();
  }, [events, sortKey, sortDir]);

  if (events.length === 0) {
    return null; // caller renders the empty state for a zero-count tab
  }

  return (
    <div>
      {/* View switcher */}
      <div className="flex items-center gap-1 mb-4 rounded-full bg-elevated p-1 w-fit">
        {VIEWS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setViewAndPersist(id)}
            aria-pressed={view === id}
            className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-full text-sm font-medium transition-colors ${
              view === id
                ? "bg-background text-foreground shadow-xs"
                : "text-text-secondary hover:text-foreground"
            }`}
          >
            <Icon className="w-3.5 h-3.5" aria-hidden />
            {label}
          </button>
        ))}
      </div>

      {view === "card" && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
          {sortedEvents.map((event, i) => (
            <NyuchiListingCard
              key={event.id}
              variant="compact"
              index={i}
              href={`/events/${event.id}`}
              title={event.name}
              category={event.category}
              mineral={categoryToMineral(event.category)}
              image={event.image ? getMediaUrl(event.image) : undefined}
              meta={[
                { label: "date", value: `${event.date.month} ${event.date.day}`, icon: Clock },
                { label: "going", value: `${event.attendeeCount} going`, icon: Users },
              ]}
            />
          ))}
        </div>
      )}

      {view === "table" && (
        <div className="rounded-2xl border border-elevated overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>
                  <button type="button" onClick={() => toggleSort("name")} className="inline-flex items-center gap-1 hover:text-foreground">
                    Event <ArrowUpDown className="w-3 h-3" aria-hidden />
                  </button>
                </TableHead>
                <TableHead>
                  <button type="button" onClick={() => toggleSort("date")} className="inline-flex items-center gap-1 hover:text-foreground">
                    Date <ArrowUpDown className="w-3 h-3" aria-hidden />
                  </button>
                </TableHead>
                <TableHead>Category</TableHead>
                <TableHead>
                  <button type="button" onClick={() => toggleSort("attendees")} className="inline-flex items-center gap-1 hover:text-foreground">
                    Attendees <ArrowUpDown className="w-3 h-3" aria-hidden />
                  </button>
                </TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedEvents.map((event) => {
                const status = statusLabel(event);
                return (
                  <TableRow key={event.id} className="cursor-pointer" onClick={() => (window.location.href = `/events/${event.id}`)}>
                    <TableCell className="font-medium">{event.name}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {event.date.month} {event.date.day}
                      {event.date.time ? ` · ${event.date.time}` : ""}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{event.category || "—"}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {event.attendeeCount}
                      {event.maximumAttendeeCapacity ? ` / ${event.maximumAttendeeCapacity}` : ""}
                    </TableCell>
                    <TableCell>
                      <Badge variant={status.variant}>{status.label}</Badge>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {view === "timeline" && (
        <NyuchiTimeline
          items={sortedEvents.map(toTimelineItem)}
          emptyState={
            <NyuchiEmptyState icon={<Users />} title="No events hosted yet" description="Create your first event to see it here." />
          }
        />
      )}
    </div>
  );
}
