"use client";

import * as React from "react";
import { Check, Clock, X, Ticket, Loader2, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { useNyuchiHarness } from "@/components/ui/harness";

/* ═══════════════════════════════════════════════════════════════
   NYUCHI RSVP BUTTON — stateful event registration control.

   Pill-shaped, mineral-accented, with the four confirmation states from
   events.rsvp_action (pending / confirmed / waitlisted / declined) plus the
   idle "none" state. Ported from mzizi and rewired onto nhimbe's harness;
   status transitions are announced to screen readers via the harness.
   ═══════════════════════════════════════════════════════════════ */

type RSVPStatus = "none" | "pending" | "confirmed" | "waitlisted" | "declined";

const statusDisplay: Record<
  RSVPStatus,
  { label: string; icon: React.ComponentType<{ className?: string; strokeWidth?: number }>; bg: string; fg: string }
> = {
  none: { label: "RSVP", icon: Ticket, bg: "var(--color-tanzanite)", fg: "var(--primary-foreground, #fff)" },
  pending: { label: "Pending", icon: Clock, bg: "rgba(251,191,36,0.15)", fg: "#B45309" },
  confirmed: { label: "Confirmed", icon: Check, bg: "rgba(74,222,128,0.15)", fg: "#15803D" },
  waitlisted: { label: "Waitlisted", icon: Users, bg: "rgba(179,136,255,0.15)", fg: "var(--color-tanzanite,#B388FF)" },
  declined: { label: "Declined", icon: X, bg: "rgba(248,113,113,0.15)", fg: "#B91C1C" },
};

interface NyuchiRSVPButtonProps {
  status?: RSVPStatus;
  price?: string | number;
  spotsRemaining?: number;
  loading?: boolean;
  disabled?: boolean;
  onRSVP?: () => void;
  onCancel?: () => void;
  full?: boolean;
  className?: string;
}

function NyuchiRSVPButton({
  status = "none",
  price,
  spotsRemaining,
  loading = false,
  disabled = false,
  onRSVP,
  onCancel,
  full = true,
  className,
}: NyuchiRSVPButtonProps) {
  const { announce } = useNyuchiHarness("rsvp-button");

  // Announce confirmation-state changes to assistive tech (skip the idle state).
  const prevStatus = React.useRef<RSVPStatus>(status);
  React.useEffect(() => {
    if (status !== prevStatus.current && status !== "none") {
      announce(`RSVP ${statusDisplay[status].label.toLowerCase()}`);
    }
    prevStatus.current = status;
  }, [status, announce]);

  const config = statusDisplay[status];
  const Icon = loading ? Loader2 : config.icon;
  const isActioned = status !== "none";
  const isFree = price === "Free" || price === 0;

  const priceLabel =
    typeof price === "number"
      ? new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(price)
      : price;

  const label = loading
    ? "Processing…"
    : status === "none"
      ? isFree
        ? "RSVP — Free"
        : `Get Tickets${priceLabel ? ` — ${priceLabel}` : ""}`
      : config.label;

  return (
    <div data-slot="nyuchi-rsvp-button" className={cn("flex flex-col gap-1.5", full && "w-full", className)}>
      <button
        type="button"
        onClick={isActioned ? onCancel : onRSVP}
        disabled={disabled || loading}
        aria-label={label}
        className={cn(
          "flex h-[52px] items-center justify-center gap-2 rounded-full text-base font-semibold transition-all",
          "min-h-[48px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)]",
          "disabled:opacity-50",
          full ? "w-full" : "px-6",
        )}
        style={{ backgroundColor: config.bg, color: config.fg }}
      >
        <Icon className={cn("size-5", loading && "animate-spin")} strokeWidth={2.2} />
        {label}
      </button>
      {spotsRemaining != null && status === "none" && (
        <span className="text-center text-[11px] text-muted-foreground">{spotsRemaining} spots remaining</span>
      )}
    </div>
  );
}

export { NyuchiRSVPButton };
export type { NyuchiRSVPButtonProps, RSVPStatus };
