"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useNyuchiHarness } from "@/components/ui/harness";
import type { Mineral } from "@/lib/category-mineral";

/* ═══════════════════════════════════════════════════════════════
   NYUCHI CALENDAR — brand date-anchored content view.

   A month grid with the signature Mukoko marker: small mineral-colored dots
   beneath dates that have associated content, a mineral highlight on
   today/selected, and an integrated agenda slot (render prop) for the
   selected day. Ported from mzizi and rewired onto nhimbe's harness.

   Self-contained grid (no react-day-picker) — nhimbe keeps the shadcn
   `calendar` primitive for form date-pickers; this is the branded events view.
   ═══════════════════════════════════════════════════════════════ */

const mineralColorMap: Record<Mineral, string> = {
  cobalt: "var(--color-cobalt,#00B0FF)",
  tanzanite: "var(--color-tanzanite,#B388FF)",
  malachite: "var(--color-malachite,#64FFDA)",
  gold: "var(--color-gold,#FFD740)",
  terracotta: "var(--color-terracotta,#D4A574)",
};

interface CalendarEvent {
  /** Date string (YYYY-MM-DD) or Date object. */
  date: string | Date;
  /** Optional mineral color for the dot (defaults to tanzanite). */
  mineral?: Mineral;
  /** Event data passed through to the agenda slot. */
  [key: string]: unknown;
}

interface NyuchiCalendarProps {
  loading?: boolean;
  events?: CalendarEvent[];
  selectedDate?: Date;
  onDateSelect?: (date: Date) => void;
  onMonthChange?: (month: Date) => void;
  renderAgenda?: (date: Date, events: CalendarEvent[]) => React.ReactNode;
  defaultMonth?: Date;
  className?: string;
}

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function NyuchiCalendar({
  loading = false,
  events = [],
  selectedDate,
  onDateSelect,
  onMonthChange,
  renderAgenda,
  defaultMonth,
  className,
}: NyuchiCalendarProps) {
  // All hooks run unconditionally, before any early return.
  useNyuchiHarness("calendar");
  const [currentMonth, setCurrentMonth] = React.useState(defaultMonth || new Date());
  const [selected, setSelected] = React.useState<Date | undefined>(selectedDate);

  React.useEffect(() => {
    if (selectedDate) setSelected(selectedDate);
  }, [selectedDate]);

  const eventsByDate = React.useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const ev of events) {
      const d = typeof ev.date === "string" ? ev.date.slice(0, 10) : dateKey(ev.date);
      const existing = map.get(d) || [];
      existing.push(ev);
      map.set(d, existing);
    }
    return map;
  }, [events]);

  if (loading) {
    return (
      <div
        data-slot="nyuchi-calendar"
        data-loading
        aria-busy="true"
        role="application"
        aria-label="Calendar"
        className="animate-pulse space-y-3 rounded-[var(--radius-lg,14px)] bg-card p-4 ring-1 ring-foreground/10"
      >
        <div className="flex justify-between">
          <div className="h-4 w-24 rounded bg-muted" />
          <div className="flex gap-1">
            <div className="size-8 rounded bg-muted" />
            <div className="size-8 rounded bg-muted" />
          </div>
        </div>
        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: 35 }).map((_, i) => (
            <div key={i} className="aspect-square rounded bg-muted" />
          ))}
        </div>
      </div>
    );
  }

  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayKey = dateKey(new Date());

  function handlePrev() {
    const prev = new Date(year, month - 1, 1);
    setCurrentMonth(prev);
    onMonthChange?.(prev);
  }

  function handleNext() {
    const next = new Date(year, month + 1, 1);
    setCurrentMonth(next);
    onMonthChange?.(next);
  }

  function handleDayClick(day: number) {
    const date = new Date(year, month, day);
    setSelected(date);
    onDateSelect?.(date);
  }

  function dayKey(day: number): string {
    return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  const monthLabel = currentMonth.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const selectedKey = selected ? dateKey(selected) : null;
  const selectedEvents = selectedKey ? eventsByDate.get(selectedKey) || [] : [];

  return (
    <div data-slot="nyuchi-calendar" role="application" aria-label="Calendar" className={cn("flex flex-col gap-4", className)}>
      {/* Month navigation */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={handlePrev}
          aria-label="Previous month"
          className="p-1 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)]"
        >
          <ChevronLeft className="size-5" />
        </button>
        <span className="text-lg font-semibold text-foreground">{monthLabel}</span>
        <button
          type="button"
          onClick={handleNext}
          aria-label="Next month"
          className="p-1 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)]"
        >
          <ChevronRight className="size-5" />
        </button>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7 gap-1">
        {DAY_LABELS.map((d) => (
          <div key={d} className="text-center text-[11px] font-medium uppercase text-muted-foreground">
            {d}
          </div>
        ))}
      </div>

      {/* Grid */}
      <div className="rounded-[var(--radius-card,14px)] bg-card p-2 ring-1 ring-foreground/10">
        <div className="grid grid-cols-7 gap-[2px]">
          {Array.from({ length: firstDay }).map((_, i) => (
            <div key={`empty-${i}`} className="aspect-square" />
          ))}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const day = i + 1;
            const key = dayKey(day);
            const isToday = key === todayKey;
            const isSelected =
              selected && selected.getDate() === day && selected.getMonth() === month && selected.getFullYear() === year;
            const dayEvents = eventsByDate.get(key) || [];
            const hasEvents = dayEvents.length > 0;
            const dotMineral: Mineral = dayEvents[0]?.mineral || "tanzanite";
            const dotColor = isToday || isSelected ? "var(--primary-foreground,#fff)" : mineralColorMap[dotMineral];

            return (
              <button
                type="button"
                key={day}
                onClick={() => handleDayClick(day)}
                aria-pressed={isSelected}
                aria-label={`${monthLabel} ${day}${hasEvents ? `, ${dayEvents.length} event${dayEvents.length === 1 ? "" : "s"}` : ""}`}
                className={cn(
                  // 4.2.0: compact square cells (aspect-ratio:1).
                  "flex aspect-square flex-col items-center justify-center rounded-[var(--radius-sm,7px)] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)]",
                  isSelected && "bg-[var(--color-tanzanite)]",
                  isToday && !isSelected && "bg-[var(--color-tanzanite)]/20",
                )}
              >
                <span
                  className={cn(
                    "text-sm",
                    isSelected && "font-semibold text-[var(--primary-foreground,#fff)]",
                    isToday && !isSelected && "font-semibold text-[var(--color-tanzanite)]",
                    !isToday && !isSelected && "text-foreground",
                  )}
                >
                  {day}
                </span>
                {hasEvents && <div className="mt-0.5 size-1 rounded-full" style={{ backgroundColor: dotColor }} />}
              </button>
            );
          })}
        </div>
      </div>

      {/* Agenda slot */}
      {selected && renderAgenda && <div data-slot="nyuchi-calendar-agenda">{renderAgenda(selected, selectedEvents)}</div>}
    </div>
  );
}

export { NyuchiCalendar, mineralColorMap };
export type { NyuchiCalendarProps, CalendarEvent };
