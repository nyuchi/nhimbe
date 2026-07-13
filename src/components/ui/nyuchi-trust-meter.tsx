"use client";

// ── INFRASTRUCTURE HARNESS (auto-wired) ──
import { useNyuchiHarness } from "@/components/ui/harness";

import * as React from "react";
import { Shield, Activity, Heart, TrendingUp, Star } from "lucide-react";
import { cn } from "@/lib/utils";

/* ═══════════════════════════════════════════════════════════════
   nyuchi trust meter — Ubuntu trust visualization (brand component).

   The expanded view of the three-axis Mukoko trust model:
     1. Verification tier — identity ladder (0–4)
     2. Platform status   — lifecycle modifier
     3. Ubuntu contribution — community value ("I am because we are")

   The composite score is the top meter; each signal is a labelled
   bar. The compact verified badge is the everyday representation;
   this is the detail view (profiles, admin, trust audits).
   Ported from mzizi and rewired onto nhimbe's harness.
   ═══════════════════════════════════════════════════════════════ */

interface TrustSignal {
  label: string;
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  value: number;
  color: string;
  detail?: string;
}

interface NyuchiTrustMeterProps {
  loading?: boolean;
  /** Composite trust score (0.000 – 1.000). */
  trustScore: number;
  verificationScore?: number;
  statusScore?: number;
  ubuntuScore?: number;
  ubuntuPoints?: number;
  subjectType?: string;
  tierLabel?: string;
  statusLabel?: string;
  /** Compact mode — just the meter bar, no signal breakdown. */
  compact?: boolean;
  className?: string;
}

function scoreToColor(score: number): string {
  if (score >= 0.4) return "#4ADE80"; // green — strong
  if (score >= 0.2) return "#FBBF24"; // amber — growing
  if (score >= 0.05) return "#FB923C"; // orange — low
  return "#6B6B66"; // grey — none
}

function NyuchiTrustMeter({
  loading = false,
  trustScore,
  verificationScore = 0,
  statusScore = 0,
  ubuntuScore = 0,
  ubuntuPoints,
  tierLabel,
  statusLabel,
  compact = false,
  className,
}: NyuchiTrustMeterProps) {
  const { animStyle } = useNyuchiHarness("trust-meter");
  const entry = animStyle();

  if (loading) {
    return (
      <div
        data-slot="nyuchi-trust-meter"
        data-loading
        role="status"
        aria-label="Trust score loading"
        className="animate-pulse space-y-3 rounded-[var(--radius-lg,14px)] bg-card p-4 ring-1 ring-foreground/10"
      >
        <div className="h-3 w-20 rounded bg-muted" />
        <div className="h-2 rounded-full bg-muted" />
        <div className="flex justify-between">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="space-y-1">
              <div className="h-2 w-8 rounded bg-muted" />
              <div className="h-1.5 w-6 rounded bg-muted" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  const percent = Math.round(trustScore * 100);
  const scoreColor = scoreToColor(trustScore);

  const signals: TrustSignal[] = [
    {
      label: "Verification",
      icon: Shield,
      value: verificationScore,
      color: "var(--color-gold,#FFD740)",
      detail: tierLabel,
    },
    {
      label: "Status",
      icon: Activity,
      value: Math.max(statusScore + 0.5, 0),
      color: statusScore >= 0 ? "#4ADE80" : "#F87171",
      detail: statusLabel,
    },
    {
      label: "Ubuntu",
      icon: Heart,
      value: ubuntuScore,
      color: "var(--color-tanzanite,#B388FF)",
      detail: ubuntuPoints != null ? `${ubuntuPoints.toLocaleString()} points` : undefined,
    },
  ];

  return (
    <div
      data-slot="nyuchi-trust-meter"
      role="meter"
      aria-label="Trust score"
      aria-valuenow={trustScore}
      aria-valuemin={0}
      aria-valuemax={1}
      style={entry}
      className={cn("rounded-[var(--radius-lg,14px)] bg-card p-4 ring-1 ring-foreground/10", className)}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <TrendingUp className="size-4 text-muted-foreground" />
          <span className="text-sm font-medium text-foreground">Trust Score</span>
        </div>
        <div className="flex items-baseline gap-1.5">
          <span className="text-2xl font-bold" style={{ color: scoreColor }}>
            {trustScore.toFixed(3)}
          </span>
          <span className="text-xs text-muted-foreground">/ 1.000</span>
        </div>
      </div>

      <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-foreground/[0.06]">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${percent}%`, backgroundColor: scoreColor }}
        />
      </div>

      {!compact && (
        <div className="mt-4 flex flex-col gap-3">
          {signals.map((signal) => {
            const Icon = signal.icon;
            const signalPercent = Math.round(Math.min(signal.value, 1) * 100);
            return (
              <div key={signal.label}>
                <div className="mb-1 flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Icon className="size-3.5" style={{ color: signal.color }} />
                    <span className="text-xs font-medium text-muted-foreground">{signal.label}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {signal.detail && (
                      <span className="text-[10px] text-muted-foreground">{signal.detail}</span>
                    )}
                    <span className="text-xs font-semibold" style={{ color: signal.color }}>
                      {signal.value.toFixed(3)}
                    </span>
                  </div>
                </div>
                <div className="h-1 w-full overflow-hidden rounded-full bg-foreground/[0.04]">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${signalPercent}%`, backgroundColor: signal.color }}
                  />
                </div>
              </div>
            );
          })}

          {ubuntuPoints != null && (
            <div className="mt-1 flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
              <Star className="size-3" style={{ color: "var(--color-gold,#FFD740)" }} />
              <span>
                {ubuntuPoints.toLocaleString()} Ubuntu Points earned through community contribution
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export { NyuchiTrustMeter };
export type { NyuchiTrustMeterProps, TrustSignal };
