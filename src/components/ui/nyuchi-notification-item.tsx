"use client";

import * as React from "react";
import {
  Bell,
  Heart,
  MessageCircle,
  UserPlus,
  Calendar,
  ShieldCheck,
  Star,
  TrendingUp,
  AlertTriangle,
  Package,
  Newspaper,
  MapPin,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getInitials } from "@/lib/avatar-initials";
import { useNyuchiHarness } from "@/components/ui/harness";

/* ═══════════════════════════════════════════════════════════════
   NYUCHI NOTIFICATION ITEM — brand component (pre-wired)

   A single notification row. Each type gets a mineral-coded icon so a
   feed can be scanned by colour. Ported from mzizi and rewired onto
   nhimbe's harness (observability + motion + a11y). Brand primary
   (tanzanite) stays reserved for the unread accent.
   ═══════════════════════════════════════════════════════════════ */

type NotificationType =
  | "like"
  | "comment"
  | "follow"
  | "event"
  | "verification"
  | "trust"
  | "achievement"
  | "alert"
  | "commerce"
  | "news"
  | "place"
  | "system";

const typeConfig: Record<
  NotificationType,
  {
    icon: React.ComponentType<{
      className?: string;
      strokeWidth?: number;
      style?: React.CSSProperties;
    }>;
    color: string;
  }
> = {
  like: { icon: Heart, color: "var(--color-error)" },
  comment: { icon: MessageCircle, color: "var(--color-cobalt)" },
  follow: { icon: UserPlus, color: "var(--color-success)" },
  event: { icon: Calendar, color: "var(--color-tanzanite)" },
  verification: { icon: ShieldCheck, color: "var(--color-warning)" },
  trust: { icon: TrendingUp, color: "var(--color-malachite)" },
  achievement: { icon: Star, color: "var(--color-gold)" },
  alert: { icon: AlertTriangle, color: "var(--color-terracotta)" },
  commerce: { icon: Package, color: "var(--color-cobalt)" },
  news: { icon: Newspaper, color: "var(--color-tanzanite)" },
  place: { icon: MapPin, color: "var(--color-success)" },
  system: { icon: Bell, color: "var(--color-status-neutral)" },
};

interface NyuchiNotificationItemProps {
  type: NotificationType;
  title: string;
  message?: string;
  timestamp: string | Date;
  read?: boolean;
  actorName?: string;
  actorAvatar?: string;
  onClick?: () => void;
  /** Skeleton placeholder while the feed loads. */
  loading?: boolean;
  className?: string;
}

function NyuchiNotificationItem({
  type,
  title,
  message,
  timestamp,
  read = false,
  actorName,
  actorAvatar,
  onClick,
  loading = false,
  className,
}: NyuchiNotificationItemProps) {
  const { animStyle } = useNyuchiHarness("notification-item");

  if (loading) {
    return (
      <div
        data-slot="nyuchi-notification-item"
        data-loading
        role="article"
        className="flex animate-pulse items-start gap-3 px-4 py-3"
      >
        <div className="size-10 shrink-0 rounded-full bg-muted" />
        <div className="flex-1 space-y-1.5">
          <div className="h-3 w-3/4 rounded bg-muted" />
          <div className="h-2.5 w-1/2 rounded bg-muted" />
        </div>
        <div className="h-2 w-10 shrink-0 rounded bg-muted" />
      </div>
    );
  }

  const config = typeConfig[type] ?? typeConfig.system;
  const Icon = config.icon;
  const time = typeof timestamp === "string" ? timestamp : timestamp.toLocaleDateString();
  const initials = getInitials(actorName);

  return (
    <div
      data-slot="nyuchi-notification-item"
      data-read={read}
      role="article"
      onClick={onClick}
      className={cn(
        "flex gap-3 px-4 py-3 transition-colors",
        !read && "bg-primary/[0.04]",
        onClick &&
          "cursor-pointer hover:bg-foreground/[0.03] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)]",
        className,
      )}
      style={animStyle()}
    >
      {actorAvatar || actorName ? (
        <div className="relative shrink-0">
          <div className="flex size-10 items-center justify-center overflow-hidden rounded-full bg-muted">
            {actorAvatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={actorAvatar} alt="" className="size-full object-cover" />
            ) : (
              <span className="text-xs font-semibold text-muted-foreground">{initials}</span>
            )}
          </div>
          <div
            className="absolute -right-0.5 -bottom-0.5 flex size-[18px] items-center justify-center rounded-full ring-2 ring-[var(--card)]"
            style={{ backgroundColor: config.color }}
          >
            <Icon className="size-2.5 text-background" strokeWidth={2.5} />
          </div>
        </div>
      ) : (
        <div
          className="flex size-10 shrink-0 items-center justify-center rounded-[var(--radius-sm,7px)]"
          style={{ backgroundColor: `color-mix(in srgb, ${config.color} 15%, transparent)` }}
        >
          <Icon className="size-5" style={{ color: config.color }} />
        </div>
      )}

      <div className="min-w-0 flex-1">
        <div className={cn("text-sm", read ? "text-muted-foreground" : "font-medium text-foreground")}>
          {title}
        </div>
        {message && <div className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{message}</div>}
        <div className="mt-1 text-[10px] text-muted-foreground/60">{time}</div>
      </div>

      {!read && <div className="mt-2 size-2 shrink-0 rounded-full bg-primary" />}
    </div>
  );
}

export { NyuchiNotificationItem };
export type { NyuchiNotificationItemProps, NotificationType };
