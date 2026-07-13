"use client";

import * as React from "react";
import Link from "next/link";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import { useNyuchiHarness } from "@/components/ui/harness";

/* ═══════════════════════════════════════════════════════════════
   NYUCHI STATS ROW — brand data-display component.

   The compact, horizontal metrics bar used on home screens,
   dashboards and admin views. Shows 2–4 stat blocks with a
   mineral-tinted icon square, large value, and optional trend badge.

   Ported from mzizi and rewired onto nhimbe's harness (observability +
   motion + a11y flow through useNyuchiHarness). Per-stat mineral is a
   categorisation accent; nhimbe's brand primary stays tanzanite.

   Layout variants:
     • inline — single-row card with all stats side by side (mobile)
     • grid   — responsive grid of stat cards (dashboard)
   ═══════════════════════════════════════════════════════════════ */

const layoutVariants = cva("", {
  variants: {
    layout: {
      inline:
        "flex flex-wrap items-center gap-4 rounded-[var(--radius-card,14px)] bg-card p-3 ring-1 ring-foreground/10",
      grid: "grid gap-3",
    },
  },
  defaultVariants: { layout: "inline" },
});

interface StatItem {
  /** Lucide icon component. */
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  /** Short label (e.g. "Active Events"). */
  label: string;
  /** Display value (e.g. "12", "2.8K", "$450"). */
  value: string | number;
  /** Mineral color for the icon background (defaults to the tanzanite lead). */
  color?: string;
  /** Trend string (e.g. "+12%", "-3%") — auto-coloured green/red. */
  trend?: string;
  /** Optional destination — renders the stat block as a Next.js Link. */
  href?: string;
}

interface NyuchiStatsRowProps extends VariantProps<typeof layoutVariants> {
  loading?: boolean;
  stats: StatItem[];
  /** Grid columns (grid layout only, default 2). */
  columns?: 2 | 3 | 4;
  className?: string;
}

const gridColsMap = {
  2: "grid-cols-2",
  3: "grid-cols-3",
  4: "grid-cols-2 sm:grid-cols-4",
} as const;

function NyuchiStatsRow({
  loading = false,
  stats,
  layout = "inline",
  columns = 2,
  className,
}: NyuchiStatsRowProps) {
  const { animStyle } = useNyuchiHarness("stats-row");

  if (loading) {
    return (
      <div
        data-slot="nyuchi-stats-row"
        data-loading
        role="group"
        aria-label="Statistics"
        aria-busy="true"
        className="flex animate-pulse gap-4"
      >
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex-1 space-y-1.5 rounded-[var(--radius-md,12px)] bg-muted p-3">
            <div className="h-2.5 w-1/2 rounded bg-foreground/5" />
            <div className="h-5 w-2/3 rounded bg-foreground/5" />
          </div>
        ))}
      </div>
    );
  }

  const isGrid = layout === "grid";

  return (
    <div
      data-slot="nyuchi-stats-row"
      role="group"
      aria-label="Statistics"
      data-layout={layout}
      style={animStyle()}
      className={cn(layoutVariants({ layout }), isGrid && gridColsMap[columns], className)}
    >
      {stats.map((stat, i) => {
        const Icon = stat.icon;
        const iconColor = stat.color || "var(--color-tanzanite)";
        const isPositiveTrend = stat.trend?.startsWith("+");
        const isNegativeTrend = stat.trend?.startsWith("-");

        if (isGrid) {
          const GridTag = stat.href ? Link : "div";
          return (
            <GridTag
              key={i}
              {...(stat.href ? { href: stat.href } : {})}
              className={cn(
                "flex flex-col gap-2 rounded-[var(--radius-card,14px)] bg-card p-4 ring-1 ring-foreground/10",
                stat.href && "transition-colors hover:ring-primary/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)]",
              )}
            >
              <div className="flex items-start justify-between">
                <div
                  className="flex size-8 items-center justify-center rounded-[var(--radius-inner,7px)]"
                  style={{ backgroundColor: `color-mix(in srgb, ${iconColor} 20%, transparent)` }}
                >
                  <Icon className="size-4" style={{ color: iconColor }} />
                </div>
                {stat.trend && (
                  <span
                    className={cn(
                      "text-[11px] font-medium",
                      isPositiveTrend && "text-emerald-400",
                      isNegativeTrend && "text-red-400",
                      !isPositiveTrend && !isNegativeTrend && "text-muted-foreground",
                    )}
                  >
                    {stat.trend}
                  </span>
                )}
              </div>
              <div className="text-2xl font-bold text-foreground">{stat.value}</div>
              <div className="text-xs text-muted-foreground">{stat.label}</div>
            </GridTag>
          );
        }

        const InlineTag = stat.href ? Link : "div";
        return (
          <InlineTag
            key={i}
            {...(stat.href ? { href: stat.href } : {})}
            className={cn(
              "flex min-w-[120px] items-center gap-2",
              stat.href &&
                "rounded-full transition-opacity hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)]",
            )}
          >
            <div
              className="flex size-8 shrink-0 items-center justify-center rounded-[var(--radius-inner,7px)]"
              style={{ backgroundColor: `color-mix(in srgb, ${iconColor} 20%, transparent)` }}
            >
              <Icon className="size-4" style={{ color: iconColor }} />
            </div>
            <div className="min-w-0">
              <div className="text-[10px] text-muted-foreground">{stat.label}</div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-[13px] font-semibold text-foreground">{stat.value}</span>
                {stat.trend && (
                  <span
                    className={cn(
                      "text-[10px] font-medium",
                      isPositiveTrend && "text-emerald-400",
                      isNegativeTrend && "text-red-400",
                    )}
                  >
                    {stat.trend}
                  </span>
                )}
              </div>
            </div>
          </InlineTag>
        );
      })}
    </div>
  );
}

export { NyuchiStatsRow };
export type { NyuchiStatsRowProps, StatItem };
