"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { useNyuchiHarness } from "@/components/ui/harness";

/* ═══════════════════════════════════════════════════════════════
   NYUCHI ALERT BANNER — mineral-coded severity alert (pre-wired)

   Universal severity alert used across the ecosystem for event
   status changes, weather advisories, security and system notices.
   Ported from mzizi and rewired onto nhimbe's harness. Severity maps
   to nhimbe minerals; the brand primary (tanzanite) is left untouched.
   ═══════════════════════════════════════════════════════════════ */

type AlertSeverity = "watch" | "moderate" | "severe";

interface NyuchiAlertBannerProps {
  /** Short category label, e.g. "Weather", "Event update". */
  type: string;
  /** Severity — drives the mineral accent + icon. */
  severity: AlertSeverity;
  /** Primary line of the alert. */
  headline: string;
  /** Supporting explanation. */
  description?: string;
  /** Affected areas (optional). */
  areas?: string[];
  /** Valid-from label (optional). */
  validFrom?: string;
  /** Valid-until label (optional). */
  validUntil?: string;
  /** Action guidance highlighted in a callout (optional). */
  instructions?: string;
  /** Dismiss handler — renders a close button when provided. */
  onDismiss?: () => void;
  /** Details handler — renders a "View details" button when provided. */
  onDetails?: () => void;
  className?: string;
}

const severityConfig: Record<
  AlertSeverity,
  { mineral: string; bg: string; icon: string; label: string }
> = {
  watch: { mineral: "var(--color-cobalt)", bg: "var(--color-cobalt)", icon: "👁", label: "Watch" },
  moderate: {
    mineral: "var(--color-terracotta)",
    bg: "var(--color-terracotta)",
    icon: "⚠️",
    label: "Moderate",
  },
  severe: { mineral: "var(--color-error)", bg: "var(--color-error)", icon: "🚨", label: "Severe" },
};

export function NyuchiAlertBanner({
  type,
  severity,
  headline,
  description,
  areas,
  validFrom,
  validUntil,
  instructions,
  onDismiss,
  onDetails,
  className,
}: NyuchiAlertBannerProps) {
  const { animStyle } = useNyuchiHarness("alert-banner");
  const config = severityConfig[severity];

  return (
    <div
      data-slot="nyuchi-alert-banner"
      data-severity={severity}
      role="alert"
      className={cn("space-y-2 rounded-[var(--radius-lg,14px)] border-l-[3px] p-4", className)}
      style={{
        borderLeftColor: config.mineral,
        backgroundColor: `color-mix(in srgb, ${config.bg} 8%, var(--card))`,
        ...animStyle(),
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span aria-hidden>{config.icon}</span>
          <span
            className="text-xs font-bold tracking-wider uppercase"
            style={{ color: config.mineral }}
          >
            {config.label} — {type}
          </span>
        </div>
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Dismiss alert"
            className="min-h-[44px] text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)]"
          >
            ✕
          </button>
        )}
      </div>

      <p className="font-serif text-sm font-semibold text-foreground">{headline}</p>
      {description && (
        <p className="text-xs leading-relaxed text-muted-foreground">{description}</p>
      )}
      {areas && areas.length > 0 && (
        <p className="text-[11px] text-muted-foreground">Areas: {areas.join(", ")}</p>
      )}
      {(validFrom || validUntil) && (
        <p className="text-[10px] text-muted-foreground">
          {validFrom && `From ${validFrom}`}
          {validUntil && ` until ${validUntil}`}
        </p>
      )}
      {instructions && (
        <div className="rounded-[var(--radius-sm,7px)] bg-muted p-2.5">
          <p className="text-xs leading-relaxed text-foreground">⚡ {instructions}</p>
        </div>
      )}
      {onDetails && (
        <button
          type="button"
          onClick={onDetails}
          className="h-10 rounded-full border px-4 text-[12px] font-medium transition-opacity hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)]"
          style={{ borderColor: config.mineral, color: config.mineral }}
        >
          View details
        </button>
      )}
    </div>
  );
}

export type { NyuchiAlertBannerProps, AlertSeverity };
