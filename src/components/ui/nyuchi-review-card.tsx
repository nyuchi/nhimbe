"use client";

import * as React from "react";
import { ThumbsUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { getInitials } from "@/lib/avatar-initials";
import { useNyuchiHarness } from "@/components/ui/harness";
import { Rating } from "@/components/ui/rating";

/* ═══════════════════════════════════════════════════════════════
   NYUCHI REVIEW CARD — universal brand review display.

   Branded review card used across every Mukoko surface with reviews.
   The reviewer's verification tier stays visible — trust matters.
   Ported from mzizi and rewired onto nhimbe's harness.

   The star colour is gold (the ratings mineral); the "helpful" affordance
   tints malachite when active. nhimbe's brand primary stays tanzanite.
   ═══════════════════════════════════════════════════════════════ */

/** Verification tier 0–4 (unverified → community → contact → government → licensed). */
export type ReviewTier = 0 | 1 | 2 | 3 | 4;

interface NyuchiReviewCardProps {
  loading?: boolean;
  /** Reviewer display name. */
  reviewer: string;
  /** Reviewer avatar URL. */
  avatarUrl?: string;
  /** Verification tier (0–4). Rendered as a mineral trust dot. */
  verificationTier?: ReviewTier;
  /** Star rating (1–5). */
  rating: number;
  /** Review body text. */
  text: string;
  /** Review date (pre-formatted). */
  date?: string;
  /** Helpful vote count. */
  helpfulCount?: number;
  /** Whether the current user has marked this helpful. */
  markedHelpful?: boolean;
  /** Helpful vote handler. */
  onHelpful?: () => void;
  /** Report handler. */
  onReport?: () => void;
  className?: string;
}

// Tier → mineral trust dot. Mirrors the verified-badge tier ladder
// (community=terracotta, contact=cobalt, government=gold, licensed=tanzanite).
const tierDot: Record<Exclude<ReviewTier, 0>, { color: string; label: string }> = {
  1: { color: "var(--color-terracotta)", label: "Community verified" },
  2: { color: "var(--color-cobalt)", label: "Contact verified" },
  3: { color: "var(--color-gold)", label: "Government verified" },
  4: { color: "var(--color-tanzanite)", label: "Licensed" },
};

export function NyuchiReviewCard({
  loading = false,
  reviewer,
  avatarUrl,
  verificationTier = 0,
  rating,
  text,
  date,
  helpfulCount,
  markedHelpful,
  onHelpful,
  onReport,
  className,
}: NyuchiReviewCardProps) {
  const { animStyle } = useNyuchiHarness("review-card");

  if (loading) {
    return (
      <div
        data-slot="nyuchi-review-card"
        data-loading
        role="article"
        aria-busy="true"
        className="animate-pulse space-y-3 rounded-[var(--radius-lg,14px)] bg-card p-4 ring-1 ring-foreground/10"
      >
        <div className="flex items-center gap-2.5">
          <div className="size-9 rounded-full bg-muted" />
          <div className="flex-1 space-y-1">
            <div className="h-3 w-1/4 rounded bg-muted" />
            <div className="h-2.5 w-16 rounded bg-muted" />
          </div>
        </div>
        <div className="h-3 w-full rounded bg-muted" />
        <div className="h-3 w-3/4 rounded bg-muted" />
      </div>
    );
  }

  const dot = verificationTier > 0 ? tierDot[verificationTier as Exclude<ReviewTier, 0>] : null;

  return (
    <div
      data-slot="nyuchi-review-card"
      role="article"
      data-tier={verificationTier}
      style={animStyle()}
      className={cn(
        "space-y-3 rounded-[var(--radius-lg,14px)] bg-card p-4 ring-1 ring-foreground/10",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <div className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted text-xs font-bold text-muted-foreground">
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatarUrl} alt={reviewer} className="size-full object-cover" />
            ) : (
              getInitials(reviewer, 1)
            )}
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <p className="text-sm font-medium text-foreground">{reviewer}</p>
              {dot && (
                <span
                  className="size-2.5 rounded-full"
                  style={{ backgroundColor: dot.color }}
                  role="img"
                  aria-label={dot.label}
                  title={dot.label}
                />
              )}
            </div>
            {date && <p className="text-[10px] text-muted-foreground">{date}</p>}
          </div>
        </div>
        <div aria-label={`${rating} out of 5 stars`}>
          <Rating value={rating} readOnly size="sm" />
        </div>
      </div>

      <p className="text-sm leading-relaxed text-foreground">{text}</p>

      {(onHelpful || onReport) && (
        <div className="flex items-center justify-between pt-1">
          {onHelpful && (
            <button
              type="button"
              onClick={onHelpful}
              aria-pressed={markedHelpful}
              className={cn(
                "inline-flex min-h-[var(--touch-target-sm,34px)] items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)]",
                markedHelpful
                  ? "bg-[var(--color-malachite)]/10 text-[var(--color-malachite)]"
                  : "text-muted-foreground hover:bg-muted",
              )}
            >
              <ThumbsUp className="size-3" />
              Helpful{helpfulCount ? ` (${helpfulCount})` : ""}
            </button>
          )}
          {onReport && (
            <button
              type="button"
              onClick={onReport}
              className="text-[10px] text-muted-foreground transition-colors hover:text-foreground"
            >
              Report
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export type { NyuchiReviewCardProps };
