"use client";

import * as React from "react";
import { MapPin, Star, Navigation } from "lucide-react";
import { cn } from "@/lib/utils";
import { useNyuchiHarness } from "@/components/ui/harness";
import type { Mineral } from "@/lib/category-mineral";

/* ═══════════════════════════════════════════════════════════════
   NYUCHI PLACE CARD — venue / place listing (extends the listing-card
   family). Row and compact variants with a mineral accent, rating,
   open/closed state, distance and a verification tier dot.

   Ported from mzizi, rewired onto nhimbe's harness, and cleaned up
   (the source shipped duplicate className/tabIndex attributes).
   ═══════════════════════════════════════════════════════════════ */

type PlaceVerification = "unverified" | "community" | "otp" | "government" | "licensed";

interface NyuchiPlaceCardProps {
  loading?: boolean;
  name: string;
  category?: string;
  address?: string;
  distance?: string;
  rating?: number;
  reviewCount?: number;
  image?: string;
  openNow?: boolean;
  verificationTier?: PlaceVerification;
  mineral?: Mineral;
  variant?: "row" | "compact";
  href?: string;
  onClick?: () => void;
  className?: string;
}

const mineralColors: Record<Mineral, string> = {
  malachite: "var(--color-malachite)",
  cobalt: "var(--color-cobalt)",
  gold: "var(--color-gold)",
  tanzanite: "var(--color-tanzanite)",
  terracotta: "var(--color-terracotta)",
};

const tierColors: Record<Exclude<PlaceVerification, "unverified">, string> = {
  community: "var(--color-terracotta)",
  otp: "var(--color-cobalt)",
  government: "var(--color-gold)",
  licensed: "var(--color-tanzanite)",
};

export function NyuchiPlaceCard({
  loading = false,
  name,
  category,
  address,
  distance,
  rating,
  reviewCount,
  image,
  openNow,
  verificationTier = "unverified",
  mineral = "tanzanite",
  variant = "row",
  href,
  onClick,
  className,
}: NyuchiPlaceCardProps) {
  const { animStyle } = useNyuchiHarness("place-card");

  if (loading) {
    return (
      <div
        data-slot="nyuchi-place-card"
        data-loading
        role="article"
        aria-busy="true"
        className="animate-pulse space-y-3 rounded-[var(--radius-lg,14px)] bg-card p-4 ring-1 ring-foreground/10"
      >
        <div className="flex gap-3">
          <div className="size-20 shrink-0 rounded-[var(--radius-md,12px)] bg-muted" />
          <div className="flex-1 space-y-2">
            <div className="h-3.5 w-3/4 rounded bg-muted" />
            <div className="h-2.5 w-full rounded bg-muted" />
            <div className="h-2.5 w-1/3 rounded bg-muted" />
          </div>
        </div>
      </div>
    );
  }

  const accent = mineralColors[mineral];
  const isVerified = verificationTier !== "unverified";
  const style = animStyle();
  const interactive = !!(href || onClick);

  const compact = (
    <>
      {image && (
        <div className="relative aspect-[16/10] overflow-hidden bg-muted">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={image} alt={name} className="size-full object-cover" />
          {distance && (
            <span className="absolute bottom-2 left-2 flex items-center gap-1 rounded-full bg-black/50 px-2 py-0.5 text-[10px] font-medium text-white backdrop-blur-sm">
              <Navigation className="size-2.5" />
              {distance}
            </span>
          )}
        </div>
      )}
      <div className="p-3">
        <div className="flex items-center gap-1.5">
          <h4 className="line-clamp-1 text-sm font-medium text-foreground">{name}</h4>
          {isVerified && (
            <span
              className="size-3.5 rounded-full"
              style={{ backgroundColor: `color-mix(in srgb, ${tierColors[verificationTier]} 40%, transparent)` }}
              aria-label={`${verificationTier} verified`}
            />
          )}
        </div>
        {category && <span className="text-[10px] text-muted-foreground">{category}</span>}
        <div className="mt-1.5 flex items-center gap-3 text-xs text-muted-foreground">
          {rating != null && (
            <span className="flex items-center gap-0.5">
              <Star className="size-3 fill-[var(--color-gold)] text-[var(--color-gold)]" />
              {rating.toFixed(1)}
              {reviewCount != null && <span className="opacity-60">({reviewCount})</span>}
            </span>
          )}
          {openNow != null && (
            <span className={openNow ? "text-[var(--color-malachite)]" : "text-red-400"}>
              {openNow ? "Open" : "Closed"}
            </span>
          )}
        </div>
      </div>
    </>
  );

  const row = (
    <>
      {image ? (
        <div className="size-12 shrink-0 overflow-hidden rounded-[var(--radius-inner,7px)] bg-muted">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={image} alt="" className="size-full object-cover" />
        </div>
      ) : (
        <div
          className="flex size-12 shrink-0 items-center justify-center rounded-[var(--radius-inner,7px)]"
          style={{ backgroundColor: `color-mix(in srgb, ${accent} 12%, transparent)` }}
        >
          <MapPin className="size-5" style={{ color: accent }} />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="line-clamp-1 text-sm font-medium text-foreground">{name}</span>
          {isVerified && (
            <span
              className="size-3 rounded-full"
              style={{ backgroundColor: tierColors[verificationTier] }}
              aria-label={`${verificationTier} verified`}
            />
          )}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
          {address && (
            <span className="flex items-center gap-1">
              <MapPin className="size-3" />
              {address}
            </span>
          )}
          {distance && (
            <span className="flex items-center gap-1">
              <Navigation className="size-3" />
              {distance}
            </span>
          )}
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-0.5">
        {rating != null && (
          <span className="flex items-center gap-0.5 text-xs font-semibold">
            <Star className="size-3 fill-[var(--color-gold)] text-[var(--color-gold)]" />
            {rating.toFixed(1)}
          </span>
        )}
        {openNow != null && (
          <span
            className={cn("text-[10px] font-medium", openNow ? "text-[var(--color-malachite)]" : "text-red-400")}
          >
            {openNow ? "Open" : "Closed"}
          </span>
        )}
      </div>
    </>
  );

  const commonProps = {
    "data-slot": "nyuchi-place-card",
    "data-variant": variant,
    "data-mineral": mineral,
    role: "article" as const,
    style,
  };

  if (variant === "compact") {
    const classes = cn(
      "overflow-hidden rounded-[var(--radius-card,14px)] bg-card ring-1 ring-foreground/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)]",
      interactive && "cursor-pointer transition-shadow hover:shadow-md",
      className,
    );
    return href ? (
      <a {...commonProps} href={href} className={classes}>
        {compact}
      </a>
    ) : (
      <div {...commonProps} onClick={onClick} tabIndex={interactive ? 0 : undefined} className={classes}>
        {compact}
      </div>
    );
  }

  const classes = cn(
    "flex items-center gap-3 rounded-[var(--radius-card,14px)] border-l-4 bg-card py-3 pr-4 pl-3 ring-1 ring-foreground/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)]",
    interactive && "cursor-pointer transition-shadow hover:shadow-md",
    className,
  );
  const rowStyle = { ...style, borderLeftColor: accent };
  return href ? (
    <a {...commonProps} href={href} style={rowStyle} className={classes}>
      {row}
    </a>
  ) : (
    <div {...commonProps} onClick={onClick} tabIndex={interactive ? 0 : undefined} style={rowStyle} className={classes}>
      {row}
    </div>
  );
}

export type { NyuchiPlaceCardProps, PlaceVerification };
