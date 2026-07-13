import * as React from "react";
import { cn } from "@/lib/utils";

/* ═══════════════════════════════════════════════════════════════
   NYUCHI META TILE — mzizi 4.2.0 date/location signature pattern.

   A rounded-square chip (an icon tile OR a month/day date chip) paired
   with a bold primary line and a 13px muted secondary line. Used for the
   When / Where rows on event detail and as the metadata unit on listing
   rows. Purely presentational — safe in server or client components.
   ═══════════════════════════════════════════════════════════════ */

interface NyuchiMetaTileProps {
  /** Icon chip (mutually exclusive with `date`). */
  icon?: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  /** Date chip — month abbrev over day numeral. */
  date?: { month: string; day: string | number };
  /** Small uppercase caption above the primary line. */
  caption?: string;
  /** Bold primary line. */
  primary: string;
  /** 13px muted secondary line. */
  secondary?: string;
  /** Accent tint for the chip glyph / date numeral. Defaults to the event
      theme primary, falling back to the brand primary. */
  tint?: string;
  /** Trailing action (e.g. a small button), right-aligned. */
  trailing?: React.ReactNode;
  className?: string;
}

export function NyuchiMetaTile({
  icon: Icon,
  date,
  caption,
  primary,
  secondary,
  tint = "var(--event-primary, var(--primary))",
  trailing,
  className,
}: NyuchiMetaTileProps) {
  return (
    <div
      data-slot="nyuchi-meta-tile"
      className={cn("flex items-center gap-3", className)}
    >
      <div
        className="flex size-12 shrink-0 flex-col items-center justify-center rounded-[var(--radius-md,12px)] border"
        style={{
          borderColor: "var(--event-surface, color-mix(in srgb, var(--primary) 18%, transparent))",
          backgroundColor: date
            ? "transparent"
            : "var(--event-surface, color-mix(in srgb, var(--primary) 12%, transparent))",
        }}
        aria-hidden
      >
        {date ? (
          <>
            <span className="text-[10px] font-semibold uppercase leading-none tracking-wide text-muted-foreground">
              {date.month.slice(0, 3)}
            </span>
            <span className="mt-0.5 text-xl font-bold leading-none" style={{ color: tint }}>
              {date.day}
            </span>
          </>
        ) : Icon ? (
          <span style={{ color: tint }}>
            <Icon className="size-5" strokeWidth={2.2} />
          </span>
        ) : null}
      </div>

      <div className="min-w-0 flex-1">
        {caption && (
          <div className="text-[13px] font-medium leading-none text-muted-foreground">{caption}</div>
        )}
        <div className={cn("truncate text-[16px] font-semibold leading-[1.25] text-foreground", caption && "mt-1")}>
          {primary}
        </div>
        {secondary && (
          <div className="mt-0.5 truncate text-[13px] text-muted-foreground">{secondary}</div>
        )}
      </div>

      {trailing && <div className="shrink-0">{trailing}</div>}
    </div>
  );
}
