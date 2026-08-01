"use client";

// ── INFRASTRUCTURE HARNESS (auto-wired) ──
import { useNyuchiHarness } from "@/components/ui/harness";

import * as React from "react";
import { TrendingUp, TrendingDown, Minus, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { getInitials } from "@/lib/avatar-initials";

/* ═══════════════════════════════════════════════════════════════
   nyuchi leaderboard row — brand identity component.

   A ranked entry: podium colouring for the top three (gold /
   tanzanite / cobalt), avatar, name (+ optional trust badge), an
   optional trend indicator, and a score. Ported from mzizi and
   rewired onto nhimbe's harness.
   ═══════════════════════════════════════════════════════════════ */

const podiumColors = [
  "var(--color-gold,#FFD740)",
  "var(--color-tanzanite,#B388FF)",
  "var(--color-cobalt,#00B0FF)",
];

interface NyuchiLeaderboardRowProps {
  loading?: boolean;
  position: number;
  name: string;
  avatar?: string;
  score: number | string;
  scoreLabel?: string;
  trend?: "up" | "down" | "same";
  trendPositions?: number;
  isCurrentUser?: boolean;
  verifiedBadge?: React.ReactNode;
  onClick?: () => void;
  className?: string;
}

function NyuchiLeaderboardRow({
  loading = false,
  position,
  name,
  avatar,
  score,
  trend,
  trendPositions,
  isCurrentUser,
  verifiedBadge,
  onClick,
  className,
}: NyuchiLeaderboardRowProps) {
  const { animStyle } = useNyuchiHarness("leaderboard-row");
  const entry = animStyle();

  if (loading) {
    return (
      <div
        data-slot="nyuchi-leaderboard-row"
        data-loading
        role="listitem"
        className="flex animate-pulse items-center gap-3 py-2"
      >
        <div className="h-4 w-6 rounded bg-muted" />
        <div className="size-8 rounded-full bg-muted" />
        <div className="h-3.5 flex-1 rounded bg-muted" />
        <div className="h-4 w-12 rounded bg-muted" />
      </div>
    );
  }

  const isPodium = position <= 3;
  const podiumColor = isPodium ? podiumColors[position - 1] : undefined;
  const initials = getInitials(name);

  return (
    <div
      data-slot="nyuchi-leaderboard-row"
      role="listitem"
      onClick={onClick}
      style={entry}
      className={cn(
        "flex items-center gap-3 px-4 py-3 transition-colors",
        isCurrentUser && "bg-[var(--color-malachite,#64FFDA)]/[0.06]",
        onClick &&
          "cursor-pointer hover:bg-foreground/[0.02] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)]",
        className,
      )}
    >
      <div
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-bold",
          isPodium ? "text-background" : "text-muted-foreground ring-1 ring-foreground/10",
        )}
        style={isPodium ? { backgroundColor: podiumColor } : undefined}
      >
        {position}
      </div>
      <div className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted">
        {avatar ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={avatar} alt="" className="size-full object-cover" />
        ) : (
          <span className="text-xs font-semibold text-muted-foreground">{initials}</span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span
            className={cn("truncate text-sm text-foreground", isCurrentUser ? "font-bold" : "font-medium")}
          >
            {name}
          </span>
          {verifiedBadge}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {trend && (
          <span
            className={cn(
              "flex items-center gap-0.5 text-[10px]",
              trend === "up"
                ? "text-[#4ADE80]"
                : trend === "down"
                  ? "text-[#F87171]"
                  : "text-muted-foreground",
            )}
          >
            {trend === "up" ? (
              <TrendingUp className="size-3" />
            ) : trend === "down" ? (
              <TrendingDown className="size-3" />
            ) : (
              <Minus className="size-3" />
            )}
            {trendPositions ? trendPositions : null}
          </span>
        )}
        <span className="flex items-center gap-1 text-sm font-semibold text-foreground">
          <Star className="size-3 text-[var(--color-gold,#FFD740)]" />
          {typeof score === "number" ? score.toLocaleString() : score}
        </span>
      </div>
    </div>
  );
}

export { NyuchiLeaderboardRow };
export type { NyuchiLeaderboardRowProps };
