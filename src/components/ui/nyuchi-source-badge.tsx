"use client";

// ── INFRASTRUCTURE HARNESS (auto-wired) ──
import { useNyuchiHarness } from "@/components/ui/harness";

import * as React from "react";
import { Newspaper, CheckCircle, AlertCircle, HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";

/* ═══════════════════════════════════════════════════════════════
   nyuchi source badge — brand identity component.

   Marks the credibility of a content source (verified / community /
   unverified / disputed) with a mineral-tinted status icon. Ported
   from mzizi and rewired onto nhimbe's harness.
   ═══════════════════════════════════════════════════════════════ */

type SourceCredibility = "verified" | "community" | "unverified" | "disputed";

type IconComponent = React.ComponentType<{ className?: string; style?: React.CSSProperties }>;

const credibilityConfig: Record<
  SourceCredibility,
  { color: string; icon: IconComponent; label: string }
> = {
  verified: { color: "var(--color-malachite,#64FFDA)", icon: CheckCircle, label: "Verified Source" },
  community: { color: "var(--color-terracotta,#D4A574)", icon: CheckCircle, label: "Community Source" },
  unverified: { color: "#6B6B66", icon: HelpCircle, label: "Unverified Source" },
  disputed: { color: "#FF5252", icon: AlertCircle, label: "Disputed Source" },
};

interface NyuchiSourceBadgeProps {
  loading?: boolean;
  sourceName: string;
  credibility?: SourceCredibility;
  showLabel?: boolean;
  className?: string;
}

function NyuchiSourceBadge({
  loading = false,
  sourceName,
  credibility = "unverified",
  showLabel = false,
  className,
}: NyuchiSourceBadgeProps) {
  const { animStyle } = useNyuchiHarness("source-badge");
  const entry = animStyle();

  if (loading) {
    return (
      <span
        data-slot="nyuchi-source-badge"
        data-loading
        role="status"
        className="inline-flex animate-pulse items-center gap-1.5"
      >
        <span className="size-4 rounded-full bg-muted" />
        <span className="h-2.5 w-12 rounded bg-muted" />
      </span>
    );
  }

  const config = credibilityConfig[credibility];
  const Icon = config.icon;
  return (
    <span
      data-slot="nyuchi-source-badge"
      role="status"
      style={entry}
      className={cn("inline-flex items-center gap-1.5 text-xs", className)}
      title={config.label}
    >
      <Newspaper className="size-3 text-muted-foreground" />
      <span className="font-medium text-foreground">{sourceName}</span>
      <Icon className="size-3" style={{ color: config.color }} />
      {showLabel && (
        <span className="text-[10px]" style={{ color: config.color }}>
          {config.label}
        </span>
      )}
    </span>
  );
}

export { NyuchiSourceBadge };
export type { NyuchiSourceBadgeProps, SourceCredibility };
