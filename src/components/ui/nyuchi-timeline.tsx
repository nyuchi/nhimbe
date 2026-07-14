"use client";

import * as React from "react";
import { Clock, MapPin, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { useNyuchiHarness } from "@/components/ui/harness";
import type { Mineral } from "@/lib/category-mineral";

/* ═══════════════════════════════════════════════════════════════
   NYUCHI TIMELINE — mzizi 4.2.0 signature discover list.

   A date-railed list: each day is a left rail (weekday · big day numeral ·
   month) beside a stack of tight horizontal rows. Each row reads
   time · title · host · location with an avatar stack and a right thumbnail.
   Harness-wired for reduced-motion entry + observability. One saturated CTA
   rule is respected — rows are quiet, borders full 1px, metadata 13px muted.
   ═══════════════════════════════════════════════════════════════ */

const mineralDot: Record<Mineral, string> = {
  cobalt: "var(--color-cobalt,#00B0FF)",
  tanzanite: "var(--color-tanzanite,#B388FF)",
  malachite: "var(--color-malachite,#64FFDA)",
  gold: "var(--color-gold,#FFD740)",
  terracotta: "var(--color-terracotta,#D4A574)",
};

export interface TimelineItem {
  id: string;
  /** Grouping + rail anchor. */
  date: string | Date;
  time?: string;
  title: string;
  host?: string;
  location?: string;
  attendeeCount?: number;
  /** Avatar image URLs (renders up to 3 as an overlapping stack). */
  avatars?: string[];
  /** Right-edge thumbnail. */
  thumbnail?: string;
  href?: string;
  mineral?: Mineral;
  category?: string;
}

interface NyuchiTimelineProps {
  items: TimelineItem[];
  loading?: boolean;
  emptyState?: React.ReactNode;
  className?: string;
}

function toDate(d: string | Date): Date {
  return typeof d === "string" ? new Date(d.length <= 10 ? `${d}T00:00:00` : d) : d;
}
function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function AvatarStack({ avatars }: { avatars: string[] }) {
  const shown = avatars.slice(0, 3);
  return (
    <div className="flex -space-x-2" aria-hidden>
      {shown.map((src, i) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={i}
          src={src}
          alt=""
          className="size-6 rounded-full border-2 border-card object-cover"
        />
      ))}
    </div>
  );
}

function TimelineRow({ item, index }: { item: TimelineItem; index: number }) {
  const { animStyle, motion } = useNyuchiHarness("timeline-row");
  const style = animStyle({ delay: motion.staggerDelay(index) });
  const dot = mineralDot[item.mineral ?? "tanzanite"];

  const body = (
    <>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
          <span className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: dot }} aria-hidden />
          {item.time && (
            <span className="inline-flex items-center gap-1">
              <Clock className="size-3" aria-hidden />
              {item.time}
            </span>
          )}
          {item.category && <span className="truncate">{item.category}</span>}
        </div>
        <h3 className="mt-1 truncate text-[16px] font-semibold leading-[1.25] text-foreground">{item.title}</h3>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[13px] text-muted-foreground">
          {item.host && <span className="truncate">{item.host}</span>}
          {item.location && (
            <span className="inline-flex items-center gap-1 truncate">
              <MapPin className="size-3 shrink-0" aria-hidden />
              {item.location}
            </span>
          )}
          {item.attendeeCount != null && item.attendeeCount > 0 && (
            <span className="inline-flex items-center gap-1">
              <Users className="size-3 shrink-0" aria-hidden />
              {item.attendeeCount}
            </span>
          )}
        </div>
      </div>

      {item.avatars && item.avatars.length > 0 && <AvatarStack avatars={item.avatars} />}

      {item.thumbnail && (
        <div className="size-14 shrink-0 overflow-hidden rounded-[var(--radius-md,12px)] bg-muted">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={item.thumbnail} alt="" className="size-full object-cover" />
        </div>
      )}
    </>
  );

  const classes =
    "group/timeline flex items-center gap-3 rounded-[var(--radius-card,14px)] border bg-card px-3.5 py-3 text-card-foreground transition-shadow hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)]";

  return item.href ? (
    <a data-slot="nyuchi-timeline-row" href={item.href} className={classes} style={style}>
      {body}
    </a>
  ) : (
    <div data-slot="nyuchi-timeline-row" className={classes} style={style}>
      {body}
    </div>
  );
}

export function NyuchiTimeline({ items, loading = false, emptyState, className }: NyuchiTimelineProps) {
  useNyuchiHarness("timeline");

  const groups = React.useMemo(() => {
    const map = new Map<string, { date: Date; items: TimelineItem[] }>();
    for (const item of items) {
      const d = toDate(item.date);
      const key = dayKey(d);
      const g = map.get(key);
      if (g) g.items.push(item);
      else map.set(key, { date: d, items: [item] });
    }
    return Array.from(map.values()).sort((a, b) => a.date.getTime() - b.date.getTime());
  }, [items]);

  if (loading) {
    return (
      <div data-slot="nyuchi-timeline" aria-busy="true" className={cn("flex flex-col gap-6", className)}>
        {Array.from({ length: 3 }).map((_, gi) => (
          <div key={gi} className="flex gap-4">
            <div className="w-12 shrink-0 animate-pulse space-y-1">
              <div className="h-3 w-8 rounded bg-muted" />
              <div className="h-6 w-8 rounded bg-muted" />
            </div>
            <div className="flex flex-1 flex-col gap-2">
              {Array.from({ length: 2 }).map((_, ri) => (
                <div key={ri} className="h-[76px] animate-pulse rounded-[var(--radius-card,14px)] border bg-card" />
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (groups.length === 0) return <>{emptyState}</>;

  return (
    <div data-slot="nyuchi-timeline" className={cn("flex flex-col gap-6", className)}>
      {groups.map((group) => {
        const weekday = group.date.toLocaleDateString(undefined, { weekday: "short" });
        const month = group.date.toLocaleDateString(undefined, { month: "short" });
        return (
          <div key={dayKey(group.date)} className="flex gap-4">
            {/* Date rail */}
            <div className="w-12 shrink-0 pt-2 text-center">
              <div className="text-[11px] font-medium uppercase leading-none tracking-wide text-muted-foreground">
                {weekday}
              </div>
              <div className="mt-1 font-serif text-2xl font-bold leading-none text-foreground">
                {group.date.getDate()}
              </div>
              <div className="mt-0.5 text-[11px] uppercase leading-none tracking-wide text-muted-foreground">
                {month}
              </div>
            </div>
            {/* Rows */}
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              {group.items.map((item, i) => (
                <TimelineRow key={item.id} item={item} index={i} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
