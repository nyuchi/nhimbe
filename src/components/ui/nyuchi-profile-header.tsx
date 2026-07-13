"use client";

// ── INFRASTRUCTURE HARNESS (auto-wired) ──
import { useNyuchiHarness } from "@/components/ui/harness";

import * as React from "react";
import { cn } from "@/lib/utils";

/* ═══════════════════════════════════════════════════════════════
   nyuchi profile header — brand identity component.

   A card-framed cover + overlapping avatar, name, bio, an actions
   slot, and a stats row. A lighter, left-aligned alternative to the
   centred profile-block (which adds the full trust breakdown).
   Ported from mzizi and rewired onto nhimbe's harness.
   ═══════════════════════════════════════════════════════════════ */

interface ProfileHeaderStat {
  label: string;
  value: string | number;
}

interface NyuchiProfileHeaderProps extends React.ComponentProps<"div"> {
  loading?: boolean;
  name: string;
  bio?: string;
  avatar?: string;
  coverImage?: string;
  /** Trust badge shown inline with the name. */
  badge?: React.ReactNode;
  stats?: ProfileHeaderStat[];
  actions?: React.ReactNode;
}

function NyuchiProfileHeader({
  className,
  loading = false,
  name,
  bio,
  avatar,
  coverImage,
  badge,
  stats,
  actions,
  ...props
}: NyuchiProfileHeaderProps) {
  const { animStyle } = useNyuchiHarness("profile-header");
  const entry = animStyle();

  const initials = name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  if (loading) {
    return (
      <div
        data-slot="nyuchi-profile-header"
        data-loading
        role="banner"
        className="animate-pulse overflow-hidden rounded-[var(--radius-xl,17px)] bg-card ring-1 ring-foreground/10"
      >
        <div className="h-32 bg-muted" />
        <div className="-mt-8 px-4 pb-4">
          <div className="size-16 rounded-full border-3 border-card bg-muted" />
          <div className="mt-2 space-y-1.5">
            <div className="h-4 w-1/3 rounded bg-muted" />
            <div className="h-2.5 w-1/4 rounded bg-muted" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      data-slot="nyuchi-profile-header"
      role="banner"
      style={entry}
      className={cn("overflow-hidden rounded-[var(--radius-xl,17px)] bg-card ring-1 ring-foreground/10", className)}
      {...props}
    >
      <div className="relative h-32 bg-muted sm:h-40">
        {coverImage && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={coverImage} alt="" className="size-full object-cover" />
        )}
      </div>
      <div className="relative px-6 pb-6">
        <div className="-mt-12 size-24 overflow-hidden rounded-full ring-4 ring-card">
          {avatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatar} alt={name} className="size-full object-cover" />
          ) : (
            <div className="flex size-full items-center justify-center bg-muted text-2xl font-medium text-muted-foreground">
              {initials}
            </div>
          )}
        </div>
        <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h2 className="flex items-center gap-1.5 font-serif text-lg font-semibold">
              {name}
              {badge}
            </h2>
            {bio && <p className="mt-1 text-sm text-muted-foreground">{bio}</p>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </div>
        {stats && stats.length > 0 && (
          <div className="mt-4 flex gap-6 border-t border-border pt-4">
            {stats.map((stat) => (
              <div key={stat.label} className="text-center">
                <p className="text-lg font-semibold">{stat.value}</p>
                <p className="text-xs text-muted-foreground">{stat.label}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export { NyuchiProfileHeader };
export type { NyuchiProfileHeaderProps, ProfileHeaderStat };
