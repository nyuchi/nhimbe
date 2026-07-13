"use client";

// ── INFRASTRUCTURE HARNESS (auto-wired) ──
import { useNyuchiHarness } from "@/components/ui/harness";

import * as React from "react";
import { Shield, Activity, Star, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PlatformStatus, VerificationTier } from "@/components/ui/verified-badge";

/* ═══════════════════════════════════════════════════════════════
   nyuchi profile block — brand identity component.

   The profile header is the ONE place where all three trust axes
   are shown in full (not just as a compact badge):
     1. Verified badge — mineral-tinted tier icon by the name
     2. Status pill    — platform lifecycle indicator
     3. Trust score    — a visual meter

   Everywhere else, trust is the compact verified badge; here users
   see the full picture. Centred layout, avatar (initials fallback),
   name in Noto Serif, trust indicators, then a stats row. Ported
   from mzizi and rewired onto nhimbe's harness + verified-badge types.
   ═══════════════════════════════════════════════════════════════ */

const TIER_DISPLAY: Record<VerificationTier, { label: string; fg: string; bg: string }> = {
  unverified: { label: "Unverified", fg: "#6B6B66", bg: "rgba(107,107,102,0.15)" },
  community: { label: "Community Verified", fg: "var(--color-terracotta,#D4A574)", bg: "rgba(212,165,116,0.15)" },
  otp: { label: "Contact Verified", fg: "var(--color-cobalt,#00B0FF)", bg: "rgba(0,176,255,0.15)" },
  government: { label: "Government Verified", fg: "var(--color-gold,#FFD740)", bg: "rgba(255,215,64,0.15)" },
  licensed: { label: "Licensed Professional", fg: "var(--color-tanzanite,#B388FF)", bg: "rgba(179,136,255,0.15)" },
};

const STATUS_DISPLAY: Record<PlatformStatus, { label: string; color: string; bg: string }> = {
  pre_verification: { label: "New", color: "#6B6B66", bg: "rgba(107,107,102,0.12)" },
  living: { label: "Active", color: "#4ADE80", bg: "rgba(74,222,128,0.12)" },
  liveness_pending: { label: "Pending", color: "#FBBF24", bg: "rgba(251,191,36,0.12)" },
  suspended: { label: "Suspended", color: "#FF5252", bg: "rgba(248,113,113,0.12)" },
  presumed_ancestral: { label: "Memorial", color: "var(--color-tanzanite,#B388FF)", bg: "rgba(167,139,250,0.12)" },
  verified_ancestral: { label: "Ancestral", color: "var(--color-tanzanite,#B388FF)", bg: "rgba(167,139,250,0.12)" },
};

interface ProfileStat {
  value: string | number;
  label: string;
}

interface NyuchiProfileBlockProps {
  loading?: boolean;
  name: string;
  subtitle?: string;
  avatar?: string;
  avatarSize?: number;
  accentColor?: string;
  verificationTier?: VerificationTier;
  platformStatus?: PlatformStatus;
  /** Trust score (0.000 – 1.000) — shown as a visual meter. */
  trustScore?: number;
  ubuntuPoints?: number;
  stats?: ProfileStat[];
  actions?: React.ReactNode;
  /** Render a custom verified badge (e.g. NyuchiVerifiedBadge) inline with the name. */
  verifiedBadge?: React.ReactNode;
  className?: string;
}

function NyuchiProfileBlock({
  loading = false,
  name,
  subtitle,
  avatar,
  avatarSize = 80,
  accentColor = "var(--primary)",
  verificationTier = "unverified",
  platformStatus = "pre_verification",
  trustScore,
  ubuntuPoints,
  stats,
  actions,
  verifiedBadge,
  className,
}: NyuchiProfileBlockProps) {
  const { animStyle } = useNyuchiHarness("profile-block");
  const entry = animStyle();

  if (loading) {
    return (
      <div
        data-slot="nyuchi-profile-block"
        data-loading
        role="region"
        aria-label="Profile"
        className="flex animate-pulse flex-col items-center gap-3 p-4"
      >
        <div className="size-16 rounded-full bg-muted" />
        <div className="h-4 w-24 rounded bg-muted" />
        <div className="h-2.5 w-16 rounded bg-muted" />
        <div className="mt-2 flex gap-6">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="space-y-1 text-center">
              <div className="mx-auto h-4 w-8 rounded bg-muted" />
              <div className="h-2 w-10 rounded bg-muted" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  const initials = name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const tierConfig = TIER_DISPLAY[verificationTier];
  const statusConfig = STATUS_DISPLAY[platformStatus];
  const showTrustIndicators = verificationTier !== "unverified" || trustScore != null;

  const trustPercent = trustScore != null ? Math.round(trustScore * 100) : 0;
  const trustColor =
    trustScore != null
      ? trustScore >= 0.4
        ? "#4ADE80"
        : trustScore >= 0.2
          ? "#FBBF24"
          : "#F87171"
      : "#6B6B66";

  return (
    <div
      data-slot="nyuchi-profile-block"
      role="region"
      aria-label="Profile"
      style={entry}
      className={cn("flex flex-col items-center px-5 py-3", className)}
    >
      <div
        className="flex items-center justify-center overflow-hidden rounded-full"
        style={{
          width: avatarSize,
          height: avatarSize,
          backgroundColor: avatar ? undefined : accentColor,
        }}
      >
        {avatar ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={avatar} alt={name} className="size-full object-cover" />
        ) : (
          <span className="font-bold text-primary-foreground" style={{ fontSize: avatarSize * 0.35 }}>
            {initials}
          </span>
        )}
      </div>

      <div className="mt-3.5 flex items-center gap-1.5">
        <h2 className="font-serif text-xl font-bold text-foreground">{name}</h2>
        {verifiedBadge
          ? verifiedBadge
          : verificationTier !== "unverified" && (
              <span
                className="inline-flex size-[18px] items-center justify-center rounded-full"
                style={{ backgroundColor: tierConfig.bg }}
                title={tierConfig.label}
              >
                <Shield className="size-3" style={{ color: tierConfig.fg }} strokeWidth={2.5} />
              </span>
            )}
      </div>

      {subtitle && <p className="mt-1 text-[13px] text-muted-foreground">{subtitle}</p>}

      {showTrustIndicators && (
        <div className="mt-4 flex w-full max-w-xs flex-col gap-3">
          <div className="flex items-center justify-center gap-3">
            <span
              className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold"
              style={{ backgroundColor: tierConfig.bg, color: tierConfig.fg }}
            >
              <Shield className="size-3" strokeWidth={2.5} />
              {tierConfig.label}
            </span>
            <span
              className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold"
              style={{ backgroundColor: statusConfig.bg, color: statusConfig.color }}
            >
              <Activity className="size-3" strokeWidth={2.5} />
              {statusConfig.label}
            </span>
          </div>

          {trustScore != null && (
            <div className="flex flex-col items-center gap-1.5">
              <div className="flex w-full items-center justify-between text-[11px]">
                <span className="flex items-center gap-1 font-medium text-muted-foreground">
                  <TrendingUp className="size-3" />
                  Trust Score
                </span>
                <span className="font-bold" style={{ color: trustColor }}>
                  {trustScore.toFixed(3)}
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-foreground/10">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${trustPercent}%`, backgroundColor: trustColor }}
                />
              </div>
              {ubuntuPoints != null && (
                <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                  <Star className="size-2.5" style={{ color: "var(--color-gold,#FFD740)" }} />
                  {ubuntuPoints.toLocaleString()} Ubuntu Points
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {stats && stats.length > 0 && (
        <div className="mt-5 flex items-center gap-8">
          {stats.map((stat) => (
            <div key={stat.label} className="text-center">
              <div className="text-xl font-bold text-foreground">{stat.value}</div>
              <div className="text-xs text-muted-foreground">{stat.label}</div>
            </div>
          ))}
        </div>
      )}

      {actions && <div className="mt-5 flex items-center gap-3">{actions}</div>}
    </div>
  );
}

export { NyuchiProfileBlock };
export type { NyuchiProfileBlockProps, ProfileStat };
