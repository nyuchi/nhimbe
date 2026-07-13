"use client";

import * as React from "react";
import { User } from "lucide-react";
import { cn } from "@/lib/utils";
import { useNyuchiHarness } from "@/components/ui/harness";
import type { Mineral } from "@/lib/category-mineral";

/* ═══════════════════════════════════════════════════════════════
   NYUCHI PROGRAMME ITEM — timeline agenda row.

   Time slot, title, host, and a mineral-colored timeline dot. Maps
   events.programme_item. Ported from mzizi and rewired onto nhimbe's harness.
   Rendered as an <li> inside an <ol role="list"> agenda on event detail.
   ═══════════════════════════════════════════════════════════════ */

const mineralColors: Record<Mineral, string> = {
  malachite: "var(--color-malachite,#64FFDA)",
  cobalt: "var(--color-cobalt,#00B0FF)",
  gold: "var(--color-gold,#FFD740)",
  tanzanite: "var(--color-tanzanite,#B388FF)",
  terracotta: "var(--color-terracotta,#D4A574)",
};

interface NyuchiProgrammeItemProps {
  loading?: boolean;
  time: string;
  title: string;
  speaker?: string;
  speakerRole?: string;
  description?: string;
  duration?: string;
  mineral?: Mineral;
  isActive?: boolean;
  isLast?: boolean;
  className?: string;
}

function NyuchiProgrammeItem({
  loading = false,
  time,
  title,
  speaker,
  speakerRole,
  description,
  duration,
  mineral = "tanzanite",
  isActive = false,
  isLast = false,
  className,
}: NyuchiProgrammeItemProps) {
  const { animStyle } = useNyuchiHarness("programme-item");

  if (loading) {
    return (
      <div data-slot="nyuchi-programme-item" data-loading role="listitem" className="flex animate-pulse gap-3 py-2">
        <div className="mt-1.5 size-2.5 rounded-full bg-muted" />
        <div className="flex-1 space-y-1.5">
          <div className="h-3 w-1/4 rounded bg-muted" />
          <div className="h-3.5 w-2/3 rounded bg-muted" />
        </div>
      </div>
    );
  }

  const color = mineralColors[mineral];

  return (
    <div data-slot="nyuchi-programme-item" role="listitem" className={cn("flex gap-3", className)} style={animStyle()}>
      {/* Timeline column */}
      <div className="flex flex-col items-center">
        <div
          className={cn("size-3 shrink-0 rounded-full ring-2 ring-card", isActive && "scale-125")}
          style={{ backgroundColor: color }}
        />
        {!isLast && <div className="w-px flex-1 bg-border" />}
      </div>
      {/* Content */}
      <div className={cn("min-w-0 flex-1 pb-6", isLast && "pb-0")}>
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-xs font-medium text-muted-foreground">{time}</span>
          {duration && <span className="text-[10px] text-muted-foreground/60">{duration}</span>}
        </div>
        <h4 className={cn("mt-1 text-sm font-medium", isActive ? "text-foreground" : "text-foreground/80")}>{title}</h4>
        {speaker && (
          <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
            <User className="size-3" />
            <span>{speaker}</span>
            {speakerRole && <span className="opacity-60">· {speakerRole}</span>}
          </div>
        )}
        {description && <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground/70">{description}</p>}
      </div>
    </div>
  );
}

export { NyuchiProgrammeItem };
export type { NyuchiProgrammeItemProps };
