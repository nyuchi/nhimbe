"use client";

// ── INFRASTRUCTURE HARNESS (auto-wired) ──
import { useNyuchiHarness } from "@/components/ui/harness";

import * as React from "react";
import { cn } from "@/lib/utils";

/* ═══════════════════════════════════════════════════════════════
   nyuchi user card — brand identity component.

   Compact person row: avatar (with initials fallback), name, an
   optional role pill, email, and a trailing actions slot. Used in
   member lists, mentions, and admin surfaces.
   ═══════════════════════════════════════════════════════════════ */

interface NyuchiUserCardProps extends React.ComponentProps<"div"> {
  loading?: boolean;
  name: string;
  email?: string;
  avatar?: string;
  role?: string;
  /** Trailing actions (e.g. follow / more menu). */
  actions?: React.ReactNode;
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function NyuchiUserCard({
  loading = false,
  className,
  name,
  email,
  avatar,
  role,
  actions,
  ...props
}: NyuchiUserCardProps) {
  const { animStyle } = useNyuchiHarness("user-card");
  const entry = animStyle();

  if (loading) {
    return (
      <div
        data-slot="nyuchi-user-card"
        data-loading
        role="article"
        className="flex animate-pulse items-center gap-3 rounded-[var(--radius-lg,14px)] bg-card p-3 ring-1 ring-foreground/10"
      >
        <div className="size-10 shrink-0 rounded-full bg-muted" />
        <div className="flex-1 space-y-1.5">
          <div className="h-3.5 w-1/3 rounded bg-muted" />
          <div className="h-2.5 w-1/4 rounded bg-muted" />
        </div>
      </div>
    );
  }

  return (
    <div
      data-slot="nyuchi-user-card"
      role="article"
      className={cn(
        "flex items-center gap-4 rounded-[var(--radius-xl,17px)] bg-card p-4 text-sm ring-1 ring-foreground/10",
        className,
      )}
      style={entry}
      {...props}
    >
      <div className="size-12 shrink-0 overflow-hidden rounded-full">
        {avatar ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={avatar} alt={name} className="size-full object-cover" />
        ) : (
          <div className="flex size-full items-center justify-center bg-muted text-base font-medium text-muted-foreground">
            {getInitials(name)}
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate font-medium">{name}</p>
          {role && (
            <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
              {role}
            </span>
          )}
        </div>
        {email && <p className="mt-0.5 truncate text-xs text-muted-foreground">{email}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-1">{actions}</div>}
    </div>
  );
}

export { NyuchiUserCard };
export type { NyuchiUserCardProps };
