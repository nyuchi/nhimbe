"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { useNyuchiHarness } from "@/components/ui/harness";

/* ═══════════════════════════════════════════════════════════════
   NYUCHI HERO STAT — brand data-display component.

   A large primary value with an optional condition line, secondary
   stats and an accent icon. The headline metric for dashboards and
   overview panels. Ported from mzizi and rewired onto nhimbe's harness.

   The accent icon reads cobalt (the "exceptional"/info mineral) by
   default via --brand-accent; nhimbe's brand primary stays tanzanite.
   ═══════════════════════════════════════════════════════════════ */

interface SecondaryStat {
  label: string;
  value: string;
}

interface NyuchiHeroStatProps {
  loading?: boolean;
  title: string;
  value: string;
  unit?: string;
  condition?: string;
  subtitle?: string;
  secondaryStats?: SecondaryStat[];
  icon?: React.ReactNode;
  onShare?: () => void;
  className?: string;
}

export function NyuchiHeroStat({
  loading = false,
  title,
  value,
  unit,
  condition,
  subtitle,
  secondaryStats,
  icon,
  onShare,
  className,
}: NyuchiHeroStatProps) {
  const { animStyle } = useNyuchiHarness("hero-stat");

  if (loading) {
    return (
      <div
        data-slot="nyuchi-hero-stat"
        data-loading
        role="region"
        aria-busy="true"
        className="animate-pulse space-y-3 rounded-[var(--radius-lg,14px)] bg-card p-5 ring-1 ring-foreground/10"
      >
        <div className="h-3 w-24 rounded bg-muted" />
        <div className="h-16 w-32 rounded bg-muted" />
        <div className="h-4 w-20 rounded bg-muted" />
        <div className="h-3 w-40 rounded bg-muted" />
      </div>
    );
  }

  return (
    <section
      data-slot="nyuchi-hero-stat"
      role="region"
      aria-label={title}
      style={animStyle()}
      className={cn(
        "rounded-[var(--radius-lg,14px)] bg-card p-5 ring-1 ring-foreground/10 sm:p-6",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          <div className="mt-1 flex items-baseline gap-1">
            <span
              className="font-mono text-6xl font-bold tracking-tighter text-foreground sm:text-7xl"
              aria-label={`${value}${unit || ""}`}
            >
              {value}
            </span>
            {unit && (
              <span className="text-2xl font-light text-muted-foreground" aria-hidden="true">
                {unit}
              </span>
            )}
          </div>
          {condition && (
            <p className="mt-1 font-serif text-base font-semibold text-foreground">{condition}</p>
          )}
          {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
          {secondaryStats && secondaryStats.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted-foreground">
              {secondaryStats.map((s, i) => (
                <span key={i}>
                  {s.label} <strong className="text-foreground">{s.value}</strong>
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          {icon && (
            <div className="text-[var(--brand-accent,var(--color-cobalt))]">{icon}</div>
          )}
          {onShare && (
            <button
              type="button"
              onClick={onShare}
              aria-label={`Share ${title}`}
              className="flex min-h-[var(--touch-target-lg,48px)] items-center justify-center rounded-full bg-muted px-4 text-sm text-muted-foreground transition-colors hover:bg-muted/80 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)]"
            >
              Share
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

export type { NyuchiHeroStatProps, SecondaryStat };
