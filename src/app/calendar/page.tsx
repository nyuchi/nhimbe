"use client";

import { useState, useMemo, useEffect } from "react";
import { MapPin, Loader2, Moon, Clock } from "lucide-react";
import { MoonPhase } from "@/components/ui/moon-phase";
import { NyuchiCalendar, type CalendarEvent } from "@/components/ui/nyuchi-calendar";
import { NyuchiListingCard } from "@/components/ui/nyuchi-listing-card";
import { categoryToMineral } from "@/lib/category-mineral";
import { type Event, getMediaUrl } from "@/lib/api";
import { getEventsAction } from "@/app/actions/discovery";

// A calendar dot carries the source event through to the agenda slot.
type EventCalendarEvent = CalendarEvent & { event: Event };

export default function CalendarPage() {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<Date>(() => new Date());

  useEffect(() => {
    async function fetchEvents() {
      try {
        const response = await getEventsAction({ limit: 100 });
        setEvents(response.events);
      } catch (error) {
        console.error("Failed to fetch events:", error);
      } finally {
        setLoading(false);
      }
    }
    fetchEvents();
  }, []);

  // Map events → mineral-coded calendar dots (category drives the mineral).
  const calendarEvents = useMemo<EventCalendarEvent[]>(
    () =>
      events.map((event) => ({
        date: event.startDate.slice(0, 10),
        mineral: categoryToMineral(event.category),
        event,
      })),
    [events],
  );

  return (
    <div className="max-w-300 mx-auto px-6 py-12">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Calendar</h1>
          <p className="text-text-secondary mt-1">View all upcoming events at a glance</p>
        </div>
        <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.04em] text-muted-foreground">
          <Moon className="w-3 h-3" strokeWidth={2.2} aria-hidden />
          Lunar-aware
        </span>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-8 h-8 text-primary animate-spin" />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,420px)_1fr] gap-8 lg:gap-12 items-start">
          <NyuchiCalendar
            events={calendarEvents}
            selectedDate={selectedDate}
            onDateSelect={setSelectedDate}
            renderAgenda={(date, dayEvents) => (
              <div className="rounded-[var(--radius-lg)] bg-muted p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-serif text-lg font-bold text-foreground">
                    {date.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
                  </h3>
                  <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.04em] text-muted-foreground">
                    <MoonPhase date={date} size={12} />
                    Lunar
                  </span>
                </div>
                {dayEvents.length > 0 ? (
                  <div className="space-y-2">
                    {(dayEvents as EventCalendarEvent[]).map((ce, i) => (
                      <NyuchiListingCard
                        key={ce.event.id}
                        variant="row"
                        index={i}
                        href={`/events/${ce.event.id}`}
                        title={ce.event.name}
                        category={ce.event.category}
                        mineral={categoryToMineral(ce.event.category)}
                        image={ce.event.image ? getMediaUrl(ce.event.image) : undefined}
                        meta={[
                          {
                            label: "time",
                            value: ce.event.date.time || `${ce.event.date.month} ${ce.event.date.day}`,
                            icon: Clock,
                          },
                          {
                            label: "venue",
                            value: ce.event.location.name || ce.event.location.addressLocality,
                            icon: MapPin,
                          },
                        ]}
                      />
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No gatherings on this day.</p>
                )}
              </div>
            )}
          />

          {/* Upcoming list — the same branded row card, sorted by date. */}
          <div>
            <h3 className="text-xl font-semibold mb-6">Upcoming</h3>
            <div className="space-y-2">
              {events
                .slice()
                .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime())
                .slice(0, 12)
                .map((event, i) => (
                  <NyuchiListingCard
                    key={event.id}
                    variant="row"
                    index={i}
                    href={`/events/${event.id}`}
                    title={event.name}
                    category={event.category}
                    mineral={categoryToMineral(event.category)}
                    image={event.image ? getMediaUrl(event.image) : undefined}
                    meta={[
                      { label: "date", value: `${event.date.month} ${event.date.day}`, icon: Clock },
                      { label: "venue", value: event.location.name || event.location.addressLocality, icon: MapPin },
                    ]}
                  />
                ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
