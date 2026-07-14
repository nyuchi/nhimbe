"use client";

import * as React from "react";
import { Calendar, MapPin, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { useNyuchiHarness } from "@/components/ui/harness";
import type { Mineral } from "@/lib/category-mineral";

/* ═══════════════════════════════════════════════════════════════
   NYUCHI COVER-WASH HEADER — 4.2.0 cover-wash signature.

   A full-bleed event/detail header that derives the whole page tint
   and CTA colour from the cover's category mineral. The cover is an
   image OR a gradient with a legibility scrim; the title, optional
   kicker/subtitle and a small inline meta row (date · location ·
   host) overlay it, and a CTA slot (children) sits with them.

   The point of the component: from an accent (or mineral) it emits
   --event-primary and --wash as inline custom properties on the
   root, so every descendant — and the rest of the detail page —
   inherits the wash context. Accent defaults to the nhimbe brand
   primary (tanzanite). Harness-wired for reduced-motion entry +
   observability.
   ═══════════════════════════════════════════════════════════════ */

const mineralColors: Record<Mineral, string> = {
  cobalt: "var(--color-cobalt,#00B0FF)",
  tanzanite: "var(--color-tanzanite,#B388FF)",
  malachite: "var(--color-malachite,#64FFDA)",
  gold: "var(--color-gold,#FFD740)",
  terracotta: "var(--color-terracotta,#D4A574)",
};

interface NyuchiCoverWashHeaderProps {
  /** Big page title. */
  title: string;
  /** Optional supporting line under the title. */
  subtitle?: string;
  /** Small eyebrow above the title. */
  kicker?: string;
  /** Cover image URL (variant: image). Takes precedence over the gradient. */
  coverImage?: string;
  /** CSS gradient for the cover when there is no image (variant: gradient). */
  coverGradient?: string;
  /** Accent that seeds --event-primary + --wash. Defaults to the brand primary. */
  accent?: string;
  /** Mineral shortcut for the accent (ignored when `accent` is set). */
  mineral?: Mineral;
  /** When the page already provides --event-primary / --wash (e.g. an event
      themed by EventThemeWrapper), inherit them instead of re-emitting — this
      avoids a self-referential custom-property cycle and keeps the hero in the
      event's own washed theme. */
  inheritWash?: boolean;
  date?: string;
  location?: string;
  host?: string;
  loading?: boolean;
  /** CTA slot — actions, right/bottom aligned. */
  children?: React.ReactNode;
  className?: string;
}

function NyuchiCoverWashHeader({
  title,
  subtitle,
  kicker,
  coverImage,
  coverGradient,
  accent,
  mineral,
  inheritWash = false,
  date,
  location,
  host,
  loading = false,
  children,
  className,
}: NyuchiCoverWashHeaderProps) {
  const { animStyle } = useNyuchiHarness("cover-wash-header");

  // When inheriting, use the page-provided --event-primary and don't re-emit
  // it (a self-reference would be a CSS cycle). Otherwise seed both vars.
  const accentColor = inheritWash
    ? "var(--event-primary)"
    : (accent ?? (mineral ? mineralColors[mineral] : "var(--primary)"));
  const wash = `color-mix(in srgb, ${accentColor} 8%, var(--surface))`;
  const fallbackGradient = `linear-gradient(135deg, color-mix(in srgb, ${accentColor} 40%, transparent), color-mix(in srgb, ${accentColor} 12%, transparent))`;

  const rootStyle = (inheritWash
    ? { ...animStyle() }
    : {
        ...animStyle(),
        "--event-primary": accentColor,
        "--wash": wash,
        background: wash,
      }) as React.CSSProperties;

  if (loading) {
    return (
      <header
        data-slot="nyuchi-cover-wash-header"
        aria-busy="true"
        className={cn("overflow-hidden rounded-[var(--radius-card,14px)] border", className)}
      >
        <div className="h-52 w-full animate-pulse bg-muted" />
        <div className="space-y-2 p-4">
          <div className="h-3 w-24 animate-pulse rounded bg-muted" />
          <div className="h-7 w-2/3 animate-pulse rounded bg-muted" />
          <div className="h-4 w-1/2 animate-pulse rounded bg-muted" />
        </div>
      </header>
    );
  }

  const hasMeta = Boolean(date || location || host);

  return (
    <header
      data-slot="nyuchi-cover-wash-header"
      data-variant={coverImage ? "image" : "gradient"}
      style={rootStyle}
      className={cn("overflow-hidden rounded-[var(--radius-card,14px)] border", className)}
    >
      {/* Full-bleed cover with legibility scrim + overlaid content */}
      <div className="relative min-h-[13rem] w-full">
        {coverImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={coverImage} alt="" aria-hidden className="absolute inset-0 size-full object-cover" />
        ) : (
          <div className="absolute inset-0" style={{ background: coverGradient ?? fallbackGradient }} aria-hidden />
        )}
        {/* Scrim */}
        <div
          className="absolute inset-0"
          style={{ background: "linear-gradient(to top, rgba(0,0,0,0.72), rgba(0,0,0,0.15) 55%, transparent)" }}
          aria-hidden
        />

        <div className="relative flex min-h-[13rem] flex-col justify-end gap-3 p-4 sm:p-6">
          <div className="min-w-0">
            {kicker && (
              <div
                className="mb-1 text-[13px] font-semibold uppercase leading-none tracking-wide"
                style={{ color: "color-mix(in srgb, var(--event-primary) 65%, white)" }}
              >
                {kicker}
              </div>
            )}
            <h1
              className="text-2xl font-bold leading-tight text-white sm:text-3xl"
              style={{ fontFamily: "var(--font-serif)" }}
            >
              {title}
            </h1>
            {subtitle && <p className="mt-1 max-w-prose text-[15px] leading-snug text-white/85">{subtitle}</p>}
          </div>

          {(hasMeta || children) && (
            <div className="flex flex-wrap items-center justify-between gap-3">
              {hasMeta && (
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-white/85">
                  {date && (
                    <span className="inline-flex items-center gap-1.5">
                      <Calendar className="size-4 shrink-0" aria-hidden />
                      {date}
                    </span>
                  )}
                  {location && (
                    <span className="inline-flex items-center gap-1.5">
                      <MapPin className="size-4 shrink-0" aria-hidden />
                      {location}
                    </span>
                  )}
                  {host && (
                    <span className="inline-flex items-center gap-1.5">
                      <Users className="size-4 shrink-0" aria-hidden />
                      {host}
                    </span>
                  )}
                </div>
              )}
              {children && <div className="ml-auto shrink-0">{children}</div>}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

export { NyuchiCoverWashHeader };
export type { NyuchiCoverWashHeaderProps };
