"use client";

// ── INFRASTRUCTURE HARNESS (auto-wired) ──
// Every brand component participates in observability, motion, and a11y
// via the harness. Zero manual config.
import { useNyuchiHarness } from "@/components/ui/harness";

import * as React from "react";
import { cn } from "@/lib/utils";

/* ═══════════════════════════════════════════════════════════════
   nyuchi cover header — brand identity component.

   A cover band with an overlapping avatar, name (Noto Serif), an
   optional trust badge and an action slot. Used at the top of
   profile / entity surfaces. Ported from mzizi and rewired onto
   nhimbe's harness (observability + motion + a11y).
   ═══════════════════════════════════════════════════════════════ */

interface NyuchiCoverHeaderProps {
  coverImage?: string;
  avatar?: string;
  avatarShape?: "circle" | "rounded";
  name: string;
  subtitle?: string;
  /** Trust badge shown inline with the name (e.g. NyuchiVerifiedBadge). */
  badge?: React.ReactNode;
  /** Action slot rendered at the cover's trailing edge (e.g. Edit button). */
  action?: React.ReactNode;
  coverHeight?: "sm" | "md" | "lg";
  className?: string;
}

const HEIGHT_MAP = { sm: "h-24 sm:h-32", md: "h-32 sm:h-48", lg: "h-40 sm:h-56" };

function NyuchiCoverHeader({
  coverImage,
  avatar,
  avatarShape = "circle",
  name,
  subtitle,
  badge,
  action,
  coverHeight = "md",
  className,
}: NyuchiCoverHeaderProps) {
  const { animStyle } = useNyuchiHarness("cover-header");

  return (
    <div
      data-slot="nyuchi-cover-header"
      role="banner"
      style={animStyle()}
      className={cn("relative", className)}
    >
      <div
        className={cn(
          HEIGHT_MAP[coverHeight],
          "rounded-b-[var(--radius-xl,17px)] bg-muted bg-cover bg-center",
        )}
        style={coverImage ? { backgroundImage: `url(${coverImage})` } : undefined}
      />
      <div className="px-4 pb-4">
        <div className="-mt-10 flex items-end justify-between">
          <div
            className={cn(
              "size-20 overflow-hidden border-4 border-background bg-muted",
              avatarShape === "circle" ? "rounded-full" : "rounded-[var(--radius-lg,14px)]",
            )}
          >
            {avatar && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatar} alt="" className="size-full object-cover" loading="lazy" />
            )}
          </div>
          {action}
        </div>
        <div className="mt-3">
          <div className="flex items-center gap-2">
            <h1 className="font-serif text-xl font-bold text-foreground">{name}</h1>
            {badge}
          </div>
          {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
        </div>
      </div>
    </div>
  );
}

export { NyuchiCoverHeader };
export type { NyuchiCoverHeaderProps };
