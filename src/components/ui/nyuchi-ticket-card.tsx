"use client";

import * as React from "react";
import { QrCode, Calendar, MapPin, Ticket, Check, X, ArrowRightLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { useNyuchiHarness } from "@/components/ui/harness";
import type { Mineral } from "@/lib/category-mineral";

/* ═══════════════════════════════════════════════════════════════
   NYUCHI TICKET CARD — digital event ticket.

   QR area, tier, and status (valid / used / cancelled / transferred), mapping
   events.ticket + events.ticket_tier. Ported from mzizi and rewired onto
   nhimbe's harness. Used in My Events and check-in flows.
   ═══════════════════════════════════════════════════════════════ */

type TicketStatus = "valid" | "used" | "cancelled" | "transferred";

const statusConfig: Record<
  TicketStatus,
  { label: string; color: string; icon: React.ComponentType<{ className?: string; strokeWidth?: number }> }
> = {
  valid: { label: "Valid", color: "var(--color-malachite, #64FFDA)", icon: Check },
  used: { label: "Used", color: "var(--muted-foreground, #6B6B66)", icon: Check },
  cancelled: { label: "Cancelled", color: "#F87171", icon: X },
  transferred: { label: "Transferred", color: "var(--color-cobalt,#00B0FF)", icon: ArrowRightLeft },
};

const mineralColors: Record<Mineral, string> = {
  malachite: "var(--color-malachite,#64FFDA)",
  cobalt: "var(--color-cobalt,#00B0FF)",
  gold: "var(--color-gold,#FFD740)",
  tanzanite: "var(--color-tanzanite,#B388FF)",
  terracotta: "var(--color-terracotta,#D4A574)",
};

interface NyuchiTicketCardProps {
  loading?: boolean;
  eventTitle: string;
  eventDate: string;
  eventVenue?: string;
  tierName?: string;
  tierPrice?: string | number;
  ticketCode?: string;
  status?: TicketStatus;
  mineral?: Mineral;
  href?: string;
  onTap?: () => void;
  className?: string;
}

function NyuchiTicketCard({
  loading = false,
  eventTitle,
  eventDate,
  eventVenue,
  tierName = "General Admission",
  tierPrice,
  ticketCode,
  status = "valid",
  mineral = "tanzanite",
  href,
  onTap,
  className,
}: NyuchiTicketCardProps) {
  const { animStyle } = useNyuchiHarness("ticket-card");

  if (loading) {
    return (
      <div
        data-slot="nyuchi-ticket-card"
        data-loading
        aria-busy="true"
        role="article"
        className="animate-pulse space-y-3 rounded-[var(--radius-lg,14px)] bg-card p-4 ring-1 ring-foreground/10"
      >
        <div className="h-24 rounded-[var(--radius-md,12px)] bg-muted" />
        <div className="h-3.5 w-2/3 rounded bg-muted" />
        <div className="h-2.5 w-1/2 rounded bg-muted" />
      </div>
    );
  }

  const sc = statusConfig[status];
  const StatusIcon = sc.icon;
  const accent = mineralColors[mineral];

  const inner = (
    <>
      {/* Top section: event info */}
      <div className="border-b border-dashed border-border px-4 py-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <h4 className="font-serif text-base font-bold text-foreground">{eventTitle}</h4>
            <div className="mt-1.5 flex flex-col gap-1 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <Calendar className="size-3" />
                {eventDate}
              </span>
              {eventVenue && (
                <span className="flex items-center gap-1.5">
                  <MapPin className="size-3" />
                  {eventVenue}
                </span>
              )}
            </div>
          </div>
          <span
            className="flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold"
            style={{ backgroundColor: `color-mix(in srgb, ${sc.color} 15%, transparent)`, color: sc.color }}
          >
            <StatusIcon className="size-3" strokeWidth={2.5} />
            {sc.label}
          </span>
        </div>
      </div>

      {/* Bottom section: tier + QR area */}
      <div className="flex items-center gap-4 px-4 py-3">
        <div
          className="flex size-16 shrink-0 items-center justify-center rounded-[var(--radius-inner,7px)]"
          style={{ backgroundColor: `color-mix(in srgb, ${accent} 10%, transparent)` }}
        >
          <QrCode className="size-8" style={{ color: accent, opacity: status === "valid" ? 1 : 0.3 }} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <Ticket className="size-3.5" style={{ color: accent }} />
            <span className="text-sm font-medium text-foreground">{tierName}</span>
          </div>
          {tierPrice != null && (
            <div className="mt-0.5 text-xs text-muted-foreground">
              {typeof tierPrice === "number" ? (tierPrice === 0 ? "Free" : `$${tierPrice}`) : tierPrice}
            </div>
          )}
          {ticketCode && (
            <div className="mt-1 font-mono text-[10px] tracking-wider text-muted-foreground/60">{ticketCode}</div>
          )}
        </div>
      </div>

      {/* Mineral accent strip */}
      <div className="h-1" style={{ backgroundColor: accent, opacity: status === "valid" ? 1 : 0.2 }} />
    </>
  );

  const classes = cn(
    "block overflow-hidden rounded-[var(--radius-card,14px)] bg-card ring-1 ring-foreground/10",
    (onTap || href) &&
      "cursor-pointer transition-shadow hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)]",
    className,
  );

  if (href) {
    return (
      <a data-slot="nyuchi-ticket-card" role="article" data-status={status} href={href} className={classes} style={animStyle()}>
        {inner}
      </a>
    );
  }

  return (
    <div
      data-slot="nyuchi-ticket-card"
      role="article"
      data-status={status}
      onClick={onTap}
      className={classes}
      style={animStyle()}
    >
      {inner}
    </div>
  );
}

export { NyuchiTicketCard };
export type { NyuchiTicketCardProps, TicketStatus };
