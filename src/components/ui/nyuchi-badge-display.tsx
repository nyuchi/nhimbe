"use client";

// ── INFRASTRUCTURE HARNESS (auto-wired) ──
import { useNyuchiHarness } from "@/components/ui/harness";

import * as React from "react";
import { Award, Lock } from "lucide-react";
import { cn } from "@/lib/utils";

/* ═══════════════════════════════════════════════════════════════
   nyuchi badge display — brand identity component.

   Ubuntu / achievement badges shown as a grid or a compact strip.
   Rarity tints draw from the Five African Minerals palette. Locked
   badges dim. Ported from mzizi and rewired onto nhimbe's harness.
   ═══════════════════════════════════════════════════════════════ */

type BadgeRarity = "common" | "uncommon" | "rare" | "legendary";

interface BadgeItem {
  id: string;
  name: string;
  description?: string;
  icon?: string;
  color?: string;
  earnedAt?: string | Date;
  rarity?: BadgeRarity;
  locked?: boolean;
}

const rarityColors: Record<BadgeRarity, string> = {
  common: "#6B6B66",
  uncommon: "var(--color-cobalt,#00B0FF)",
  rare: "var(--color-tanzanite,#B388FF)",
  legendary: "var(--color-gold,#FFD740)",
};

interface NyuchiBadgeDisplayProps {
  loading?: boolean;
  badges: BadgeItem[];
  layout?: "grid" | "strip";
  maxVisible?: number;
  className?: string;
}

function NyuchiBadgeDisplay({
  loading = false,
  badges,
  layout = "grid",
  maxVisible,
  className,
}: NyuchiBadgeDisplayProps) {
  const { animStyle } = useNyuchiHarness("badge-display");
  const entry = animStyle();

  if (loading) {
    return (
      <div
        data-slot="nyuchi-badge-display"
        data-loading
        role="list"
        aria-label="Badges"
        className="flex animate-pulse gap-2"
      >
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="size-12 rounded-[var(--radius-md,12px)] bg-muted" />
        ))}
      </div>
    );
  }

  const visible = maxVisible ? badges.slice(0, maxVisible) : badges;
  const remaining = maxVisible ? Math.max(badges.length - maxVisible, 0) : 0;

  if (layout === "strip") {
    return (
      <div
        data-slot="nyuchi-badge-display"
        role="list"
        aria-label="Badges"
        style={entry}
        className={cn("flex items-center gap-2", className)}
      >
        {visible.map((b) => {
          const color = b.color || rarityColors[b.rarity || "common"];
          return (
            <div
              key={b.id}
              role="listitem"
              title={`${b.name}${b.locked ? " (Locked)" : ""}`}
              className={cn("flex size-9 items-center justify-center rounded-full", b.locked && "opacity-30")}
              style={{ backgroundColor: `color-mix(in srgb, ${color} 15%, transparent)` }}
            >
              {b.locked ? (
                <Lock className="size-4 text-muted-foreground" />
              ) : (
                <Award className="size-4" style={{ color }} />
              )}
            </div>
          );
        })}
        {remaining > 0 && (
          <span className="text-xs font-medium text-muted-foreground">+{remaining}</span>
        )}
      </div>
    );
  }

  return (
    <div
      data-slot="nyuchi-badge-display"
      role="list"
      aria-label="Badges"
      style={entry}
      className={cn("grid grid-cols-4 gap-3", className)}
    >
      {visible.map((b) => {
        const color = b.color || rarityColors[b.rarity || "common"];
        return (
          <div
            key={b.id}
            role="listitem"
            title={b.description || b.name}
            className={cn(
              "flex flex-col items-center gap-1.5 rounded-[var(--radius-lg,14px)] bg-card p-3 text-center ring-1 ring-foreground/10",
              b.locked && "opacity-30",
            )}
          >
            <div
              className="flex size-10 items-center justify-center rounded-full"
              style={{ backgroundColor: `color-mix(in srgb, ${color} 15%, transparent)` }}
            >
              {b.locked ? (
                <Lock className="size-5 text-muted-foreground" />
              ) : (
                <Award className="size-5" style={{ color }} />
              )}
            </div>
            <span className="line-clamp-1 text-[10px] font-medium text-foreground">{b.name}</span>
            {b.rarity && !b.locked && (
              <span className="text-[8px] font-semibold uppercase tracking-wider" style={{ color }}>
                {b.rarity}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

export { NyuchiBadgeDisplay };
export type { NyuchiBadgeDisplayProps, BadgeItem, BadgeRarity };
