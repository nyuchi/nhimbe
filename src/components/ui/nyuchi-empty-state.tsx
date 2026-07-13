"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { useNyuchiHarness } from "@/components/ui/harness";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
  EmptyContent,
} from "@/components/ui/empty";
import { Button } from "@/components/ui/button";
import type { Mineral } from "@/lib/category-mineral";

/* ═══════════════════════════════════════════════════════════════
   NYUCHI EMPTY STATE — branded empty state (pre-wired)

   The branded empty state for every list surface across nhimbe.
   Ported from mzizi and rewired onto nhimbe's harness + the merged
   `Empty` primitive family — it does NOT re-implement the layout, it
   composes Empty / EmptyHeader / EmptyMedia / EmptyTitle /
   EmptyDescription / EmptyContent and adds the harness entry
   animation, an optional mineral-tinted icon, and up to two actions.

   Brand primary stays tanzanite; `mineral` only tints the icon bubble
   as a category cue.
   ═══════════════════════════════════════════════════════════════ */

const mineralIconTint: Record<Mineral, string> = {
  cobalt: "bg-[var(--color-cobalt)]/10 text-[var(--color-cobalt)]",
  tanzanite: "bg-primary/10 text-primary",
  malachite: "bg-[var(--color-malachite)]/10 text-[var(--color-malachite)]",
  gold: "bg-[var(--color-gold)]/10 text-[var(--color-gold)]",
  terracotta: "bg-[var(--color-terracotta)]/10 text-[var(--color-terracotta)]",
};

interface NyuchiEmptyStateProps {
  /** Illustration, icon element or emoji shown above the title. */
  icon?: React.ReactNode;
  /** Primary message — what is empty. */
  title: string;
  /** Supporting explanation — what the user can do next. */
  description?: string;
  /** Primary CTA label. */
  actionLabel?: string;
  /** Primary CTA handler. */
  onAction?: () => void;
  /** Secondary action label. */
  secondaryLabel?: string;
  /** Secondary action handler. */
  onSecondary?: () => void;
  /** Category cue that tints the icon bubble. Defaults to tanzanite. */
  mineral?: Mineral;
  /** Compact mode for inline empty states within cards. */
  compact?: boolean;
  className?: string;
}

export function NyuchiEmptyState({
  icon,
  title,
  description,
  actionLabel,
  onAction,
  secondaryLabel,
  onSecondary,
  mineral = "tanzanite",
  compact = false,
  className,
}: NyuchiEmptyStateProps) {
  const { animStyle } = useNyuchiHarness("empty-state");
  const entry = animStyle();

  return (
    <Empty
      data-slot="nyuchi-empty-state"
      data-mineral={mineral}
      className={cn(compact ? "gap-3 p-8" : "py-16", className)}
      style={entry}
    >
      <EmptyHeader>
        {icon && (
          <EmptyMedia
            variant="icon"
            className={cn(
              "rounded-full",
              mineralIconTint[mineral],
              compact
                ? "size-12 [&_svg:not([class*='size-'])]:size-5"
                : "size-16 [&_svg:not([class*='size-'])]:size-7",
            )}
          >
            {icon}
          </EmptyMedia>
        )}
        <EmptyTitle className={cn("font-serif", compact ? "text-base" : "text-lg")}>
          {title}
        </EmptyTitle>
        {description && (
          <EmptyDescription className="max-w-[280px]">{description}</EmptyDescription>
        )}
      </EmptyHeader>

      {(onAction || onSecondary) && (
        <EmptyContent className="flex-row justify-center gap-2">
          {onAction && actionLabel && (
            <Button onClick={onAction} className="rounded-full">
              {actionLabel}
            </Button>
          )}
          {onSecondary && secondaryLabel && (
            <Button variant="outline" onClick={onSecondary} className="rounded-full">
              {secondaryLabel}
            </Button>
          )}
        </EmptyContent>
      )}
    </Empty>
  );
}

export type { NyuchiEmptyStateProps };
