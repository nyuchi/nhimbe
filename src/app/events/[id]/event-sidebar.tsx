"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { TrendingUp, Eye, Users, Star, Share2, QrCode, Flame, ArrowRight, Hourglass } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { EventQRCode } from "./event-qr-code";
import { ShareButton } from "./event-actions";
import { RegistrationPanel } from "./registration-panel";
import { HostReputation } from "@/components/ui/host-reputation";
import { NyuchiAvatarStack } from "@/components/ui/nyuchi-avatar-stack";
import { EventEntityHostCard } from "./event-entity-host-card";
import { joinWaitlist, leaveWaitlist, getWaitlistStatus } from "@/app/actions/waitlist";
import { useAuth } from "@/components/auth/auth-context";
import { useT } from "@/lib/i18n";
import type { Event, EventStats, ReviewStats } from "@/lib/api";

interface EventSidebarProps {
  event: Event;
  stats: EventStats | null;
  reviewStats: ReviewStats | null;
}

function formatViews(count: number): string {
  if (count >= 1000) return `${(count / 1000).toFixed(1)}K`;
  return count.toString();
}

function StatBox({ icon, label, value }: { icon: React.ReactNode; label: string; value: string | number }) {
  return (
    <div className="p-3 rounded-lg" style={{ backgroundColor: "var(--background)" }}>
      <div className="flex items-center gap-1.5 text-foreground/60 mb-1">
        {icon}
        <span className="text-xs">{label}</span>
      </div>
      <div className="text-lg font-bold">{value}</div>
    </div>
  );
}

/**
 * Waitlist control shown when an event is at capacity. Joins/leaves via the
 * MongoDB-backed server actions; only interactive for signed-in users.
 */
function WaitlistControl({ eventId }: { eventId: string }) {
  const { isAuthenticated, isLoading } = useAuth();
  const [onWaitlist, setOnWaitlist] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!isAuthenticated) return;
    let active = true;
    getWaitlistStatus(eventId)
      .then((res) => {
        if (active) setOnWaitlist(res.onWaitlist);
      })
      .catch(() => {
        /* leave default (not on waitlist) on read failure */
      });
    return () => {
      active = false;
    };
  }, [eventId, isAuthenticated]);

  if (isLoading) return null;

  const toggle = () => {
    setError(null);
    startTransition(async () => {
      try {
        const res = onWaitlist ? await leaveWaitlist(eventId) : await joinWaitlist(eventId);
        setOnWaitlist(res.onWaitlist);
      } catch {
        setError("Something went wrong. Please try again.");
      }
    });
  };

  return (
    <div className="mt-4 pt-4 border-t" style={{ borderColor: "var(--event-border)" }}>
      <div className="flex items-center gap-1.5 text-foreground/60 mb-2">
        <Hourglass className="w-3.5 h-3.5" />
        <span className="text-xs">This event is full</span>
      </div>
      {isAuthenticated ? (
        <Button
          variant={onWaitlist ? "secondary" : "default"}
          className="w-full py-4 text-base"
          onClick={toggle}
          disabled={pending}
        >
          {pending
            ? onWaitlist
              ? "Leaving..."
              : "Joining..."
            : onWaitlist
              ? "Leave waitlist"
              : "Join waitlist"}
        </Button>
      ) : (
        <Link href={`/auth/hosted?return_to=${encodeURIComponent(`/events/${eventId}`)}`}>
          <Button variant="default" className="w-full py-4 text-base">
            Sign in to join the waitlist
          </Button>
        </Link>
      )}
      {error && <p className="text-xs text-red-400 mt-2">{error}</p>}
    </div>
  );
}

export function EventSidebar({ event, stats, reviewStats }: EventSidebarProps) {
  const { t } = useT();
  const [hasEntityHost, setHasEntityHost] = useState(false);
  const capacityPercent = event.maximumAttendeeCapacity
    ? Math.min((event.attendeeCount / event.maximumAttendeeCapacity) * 100, 100)
    : 0;
  const spotsLeft = event.maximumAttendeeCapacity
    ? event.maximumAttendeeCapacity - event.attendeeCount
    : null;

  return (
    <aside data-slot="event-sidebar" className="lg:sticky lg:top-[calc(4rem+env(safe-area-inset-top,0px))] self-start space-y-6">
      {/* Ticket Card */}
      <Card className="border-0" style={{ backgroundColor: "var(--event-surface)" }}>
        <CardContent className="p-6">
          <RegistrationPanel eventId={event.id} price={event.offers} spotsRemaining={spotsLeft} />

          {event.maximumAttendeeCapacity && (
            <div className="mt-4 pt-4 border-t" style={{ borderColor: "var(--event-border)" }}>
              <div className="flex items-center justify-between text-sm mb-2">
                <span className="text-foreground/60">Spots</span>
                <span className="font-medium">{event.attendeeCount} / {event.maximumAttendeeCapacity}</span>
              </div>
              <Progress value={capacityPercent} className="h-2" />
              {spotsLeft !== null && spotsLeft > 0 && spotsLeft < event.maximumAttendeeCapacity * 0.2 && (
                <p className="text-xs text-red-400 mt-2">Only {spotsLeft} spots left!</p>
              )}
            </div>
          )}

          {spotsLeft !== null && spotsLeft <= 0 && <WaitlistControl eventId={event.id} />}
        </CardContent>
      </Card>

      {/* Event Insights */}
      {(stats || reviewStats) && (
        <Card className="border-0" style={{ backgroundColor: "var(--event-surface)" }}>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2.5 text-sm">
              <TrendingUp className="w-4.5 h-4.5" style={{ color: "var(--event-primary)" }} />
              Event Insights
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="grid grid-cols-2 gap-3">
              {stats?.views !== undefined && (
                <StatBox icon={<Eye className="w-3.5 h-3.5" />} label="Views" value={formatViews(stats.views)} />
              )}
              <StatBox icon={<Users className="w-3.5 h-3.5" />} label="Going" value={event.attendeeCount} />
              {reviewStats && reviewStats.totalReviews > 0 && (
                <StatBox icon={<Star className="w-3.5 h-3.5 text-accent" />} label="Rating" value={reviewStats.averageRating.toFixed(1)} />
              )}
              {stats?.referrals !== undefined && stats.referrals > 0 && (
                <StatBox icon={<Share2 className="w-3.5 h-3.5" />} label="Referrals" value={stats.referrals} />
              )}
            </div>
            <p className="text-xs text-foreground/40 text-center mt-3">Open data - Transparency builds trust</p>
          </CardContent>
        </Card>
      )}

      {/* QR Code */}
      <Card className="border-0" style={{ backgroundColor: "var(--event-surface)" }}>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2.5 text-sm">
            <QrCode className="w-4.5 h-4.5" style={{ color: "var(--event-primary)" }} />
            Share Event
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <EventQRCode shortCode={event.shortCode} title={event.name} />
          <div className="mt-4 flex gap-2">
            <ShareButton event={event} />
          </div>
        </CardContent>
      </Card>

      {/* Friends */}
      {event.friends && event.friends.length > 0 && (
        <Card className="border-0" style={{ backgroundColor: "var(--event-surface)" }}>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2.5 text-sm">
              <Users className="w-4.5 h-4.5" style={{ color: "var(--event-primary)" }} />
              {event.friends.length} friend{event.friends.length > 1 ? "s" : ""} going
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <NyuchiAvatarStack
              people={event.friends.map((friend) => ({ name: friend.name }))}
              max={6}
              label=""
            />
          </CardContent>
        </Card>
      )}

      {/* Host card — entity path (MongoDB via server action) with legacy fallback */}
      <EventEntityHostCard eventId={event.id} onResolved={setHasEntityHost} />
      {!hasEntityHost && (
        <HostReputation
          host={{
            name: event.organizer.name,
            handle: event.organizer.identifier,
            initials: event.organizer.initials,
            eventsHosted: event.organizer.eventCount,
            rating: reviewStats?.averageRating,
            reviewCount: reviewStats?.totalReviews,
            badges: event.organizer.eventCount > 10 ? ["trusted-host", "veteran"] : event.organizer.eventCount > 5 ? ["trusted-host"] : ["rising-star"],
          }}
          variant="compact"
        />
      )}

      {/* View circle */}
      <Card
        className="border-0 overflow-hidden"
        style={{
          background:
            "linear-gradient(135deg, color-mix(in srgb, var(--heritage-savanna) 22%, var(--surface)), color-mix(in srgb, var(--heritage-baobab) 18%, var(--surface)))",
        }}
      >
        <CardContent className="p-5">
          <div className="flex items-start gap-3 mb-3">
            <div
              className="w-9 h-9 rounded-lg flex items-center justify-center text-primary-foreground shrink-0"
              style={{
                background:
                  "linear-gradient(135deg, var(--heritage-savanna), var(--heritage-baobab))",
              }}
              aria-hidden
            >
              <Flame className="w-4.5 h-4.5" />
            </div>
            <div className="flex-1">
              <h4 className="font-semibold text-sm">{t("circle.title")}</h4>
              <p className="text-xs text-foreground/60">{t("circle.subtitle")}</p>
            </div>
          </div>
          <Link
            href={event.eventCircleId ? `/circles/${event.eventCircleId}` : "/circles"}
            className="inline-flex items-center justify-center gap-1.5 w-full h-[var(--touch-target)] rounded-full bg-primary text-primary-foreground text-sm font-semibold transition-transform duration-[var(--motion-quick)] hover:-translate-y-px"
          >
            {t("circle.view")}
            <ArrowRight className="w-4 h-4" aria-hidden />
          </Link>
        </CardContent>
      </Card>
    </aside>
  );
}
