"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { ArrowLeft, MapPin, Video, Bookmark, ChevronRight, Flame, Eye, Star, Settings, Pencil } from "lucide-react";
import { useTrackedLink } from "@/lib/use-tracked-link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { NyuchiAlertBanner, type AlertSeverity } from "@/components/ui/nyuchi-alert-banner";
import { NyuchiMetaTile } from "@/components/ui/nyuchi-meta-tile";
import { AddToCalendarButton, GetDirectionsButton } from "./event-actions";
import { LikeButton } from "./like-button";
import { EventThemeWrapper } from "./event-theme-wrapper";
import { EventWeather } from "./event-weather";
import { NyuchiCoverWashHeader } from "@/components/ui/nyuchi-cover-wash-header";
import { EventSidebar } from "./event-sidebar";
import { RSVPButton } from "./rsvp-button";
import {
  EventInfoTiles,
  EventPulseStrip,
  EventCircleCta,
  EventContributionsBoard,
} from "./event-info-tiles";
import { EventEntityHostCard } from "./event-entity-host-card";
import { EventSpecifics } from "./event-specifics";
import { EventVenueCard } from "./event-venue-card";
import { EventPolls } from "./event-polls";
import { CampfireThread } from "@/components/ui/campfire-thread";
import { type UserReferralCode, type EventStats, type ReviewStats } from "@/lib/api";
import type { Event } from "@/lib/api";
import { useSaveEvent } from "@/lib/use-save-event";

const EventRatings = dynamic(
  () => import("@/components/ui/event-ratings").then(m => ({ default: m.EventRatings })),
  { ssr: false, loading: () => <Skeleton className="h-48 w-full rounded-2xl" /> }
);

const ReferralLeaderboard = dynamic(
  () => import("@/components/ui/referral-leaderboard").then(m => ({ default: m.ReferralLeaderboard })),
  { ssr: false, loading: () => <Skeleton className="h-64 w-full rounded-2xl" /> }
);

// Deferred like the two above: EventMap's static `import "leaflet/dist/leaflet.css"`
// was shipping Leaflet's CSS on every /events/[id] navigation even when the
// visitor never scrolls to the map (the Leaflet JS itself was already lazy —
// only the CSS wasn't).
const EventMap = dynamic(
  () => import("./event-map").then(m => ({ default: m.EventMap })),
  { ssr: false, loading: () => <Skeleton className="h-64 w-full rounded-2xl" /> }
);

interface EventDetailContentProps {
  event: Event;
  /** Resolved server-side in page.tsx (parallel with the event read) — see loadCompanionData. */
  initialStats: EventStats | null;
  initialReviewStats: ReviewStats | null;
  initialUserReferral: UserReferralCode | null;
  /** Whether the viewer hosts this event (canManageEventAction) — gates the Manage entry point. */
  canManage: boolean;
}

/** Map a schema.org eventStatus to a branded alert; null when scheduled. */
function eventStatusAlert(
  status?: string,
): { severity: AlertSeverity; headline: string; description: string } | null {
  if (!status) return null;
  const s = status.replace(/^https?:\/\/schema\.org\//, "");
  switch (s) {
    case "EventCancelled":
      return {
        severity: "severe",
        headline: "This event has been cancelled",
        description:
          "The host has cancelled this event. Check back for updates or explore other events.",
      };
    case "EventPostponed":
      return {
        severity: "moderate",
        headline: "This event has been postponed",
        description: "A new date has not been confirmed yet. Watch this page for the rescheduled time.",
      };
    case "EventRescheduled":
      return {
        severity: "moderate",
        headline: "This event has been rescheduled",
        description: "The date or time has changed — check the details below.",
      };
    case "EventMovedOnline":
      return {
        severity: "watch",
        headline: "This event has moved online",
        description: "The event is now taking place online. See the joining details below.",
      };
    default:
      return null;
  }
}

function formatViews(count: number): string {
  if (count >= 1000) return `${(count / 1000).toFixed(1)}K`;
  return count.toString();
}

export function EventDetailContent({
  event,
  initialStats,
  initialReviewStats,
  initialUserReferral,
  canManage,
}: EventDetailContentProps) {
  const statusAlert = eventStatusAlert(event.eventStatus);
  // Resolved server-side (see page.tsx's loadCompanionData) — no client
  // fetch, no setter, nothing to update after mount.
  const userReferral = initialUserReferral;
  const stats = initialStats;
  const reviewStats = initialReviewStats;
  // Bookmark / save persists to events.save_action via the hook — no more
  // local-only state. canSave gates the click for unauthenticated users.
  const { saved, toggle: toggleSaved, canSave: canSaveEvent } = useSaveEvent(event.id);
  const bookmarked = !!saved;
  const isPastEvent = new Date(event.startDate) < new Date();
  const isOnline = event.eventAttendanceMode === "OnlineEventAttendanceMode";
  const isInPerson = !isOnline && event.location.addressLocality !== "Online";

  // Tracked links for click analytics — all external links route through /r/[code]
  const trackedMeetingUrl = useTrackedLink(
    isOnline ? event.meetingUrl : undefined,
    event.id,
    "meeting_url"
  );
  const trackedTicketUrl = useTrackedLink(
    event.offers?.url,
    event.id,
    "ticket"
  );

  return (
    <EventThemeWrapper coverGradient={event.coverGradient}>
      {/* Extra bottom padding on mobile for the sticky RSVP bar */}
      <div className="max-w-250 mx-auto px-4 sm:px-6 py-6 sm:py-10 pb-[calc(5.5rem+env(safe-area-inset-bottom,0px))] lg:pb-10">
        <div className="flex items-center justify-between mb-4 sm:mb-6">
          <Link href="/" className="inline-flex items-center gap-2 text-sm font-medium text-foreground/60 hover:text-foreground h-10 px-3 -ml-3 rounded-xl hover:bg-surface transition-colors">
            <ArrowLeft className="w-4.5 h-4.5" />
            Back to events
          </Link>
          {canManage && (
            <div className="flex items-center gap-1 -mr-3">
              <Link
                href={`/events/${event.id}/edit`}
                className="inline-flex items-center gap-2 text-sm font-medium text-foreground/60 hover:text-foreground h-10 px-3 rounded-xl hover:bg-surface transition-colors"
              >
                <Pencil className="w-4.5 h-4.5" />
                Edit
              </Link>
              <Link
                href={`/events/${event.id}/manage`}
                className="inline-flex items-center gap-2 text-sm font-medium text-foreground/60 hover:text-foreground h-10 px-3 rounded-xl hover:bg-surface transition-colors"
              >
                <Settings className="w-4.5 h-4.5" />
                Manage
              </Link>
            </div>
          )}
        </div>

        {statusAlert && (
          <NyuchiAlertBanner
            type="Event update"
            severity={statusAlert.severity}
            headline={statusAlert.headline}
            description={statusAlert.description}
            className="mb-4 sm:mb-6"
          />
        )}

        {/* 4.2.0 washed hero — cover + title + category kicker + meta, in the
            event's own theme (inheritWash consumes the page --event-primary /
            --wash). Live stats (hot / views / rating) ride in the CTA slot. */}
        <NyuchiCoverWashHeader
          inheritWash
          className="mb-6 sm:mb-8"
          coverImage={event.image || undefined}
          coverGradient={event.coverGradient}
          kicker={event.category}
          title={event.name}
          date={event.date.full}
          location={isOnline ? "Online" : event.location.name}
          host={event.organizer.name}
        >
          {(stats?.isHot || (stats?.views ?? 0) > 0 || (reviewStats?.averageRating ?? 0) > 0) && (
            <div className="flex flex-wrap items-center gap-2">
              {stats?.isHot && (
                <span className="inline-flex items-center gap-1 rounded-full bg-black/50 px-2.5 py-1 text-[11px] font-semibold text-white backdrop-blur-sm">
                  <Flame className="size-3.5" aria-hidden /> Hot
                </span>
              )}
              {(stats?.views ?? 0) > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-black/50 px-2.5 py-1 text-[11px] font-medium text-white backdrop-blur-sm">
                  <Eye className="size-3.5" aria-hidden /> {formatViews(stats!.views!)}
                </span>
              )}
              {reviewStats && reviewStats.averageRating > 0 && reviewStats.totalReviews > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-black/50 px-2.5 py-1 text-[11px] font-medium text-white backdrop-blur-sm">
                  <Star className="size-3.5 fill-current" aria-hidden /> {reviewStats.averageRating.toFixed(1)}
                </span>
              )}
            </div>
          )}
        </NyuchiCoverWashHeader>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-8 lg:gap-12">
          {/* Main Content */}
          <div>
            {/* Featured in badge - Luma style */}
            {event.location.addressLocality && event.location.addressLocality !== "Online" && (
              <div className="flex items-center gap-2 mb-3">
                <Badge
                  variant="ghost"
                  className="text-xs font-medium border-0 px-0"
                  style={{ color: "var(--event-primary)" }}
                >
                  Featured in {event.location.addressLocality} <ChevronRight className="w-3 h-3 inline" />
                </Badge>
              </div>
            )}

            {/* Live attendance pulse strip — signature visual from Nhimbe.html */}
            <EventPulseStrip event={event} />

            {/* 3-up info tiles — When / Where / Weather. The weather slot is
                rendered by the existing EventWeather component (lazy-loaded) so
                this tile cell stays light unless the event has a place + date.*/}
            <EventInfoTiles
              event={event}
              weatherSlot={
                event.location.addressLocality && event.location.addressLocality !== "Online" ? (
                  <EventWeather
                    city={event.location.addressLocality}
                    eventDate={event.startDate}
                  />
                ) : undefined
              }
            />

            {/* "View circle" CTA when events.events.circleId is set */}
            <EventCircleCta event={event} />

            {/* Compact host link under title */}
            <Link href="#hosted-by" className="flex items-center gap-2 mb-5 sm:mb-6 group">
              <div
                className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-[#0A0A0A] shrink-0"
                style={{ background: `linear-gradient(135deg, var(--event-primary), var(--event-secondary))` }}
              >
                {event.organizer.initials}
              </div>
              <span className="text-sm text-foreground/60 group-hover:text-foreground transition-colors">
                {event.organizer.name} <ChevronRight className="w-3 h-3 inline" />
              </span>
            </Link>

            {/* Date + Location — 4.2.0 meta tiles (date/icon chip + primary/secondary) */}
            <NyuchiMetaTile
              className="mb-4"
              date={{ month: event.date.month, day: event.date.day }}
              primary={event.date.full}
              secondary={event.date.time}
              trailing={<AddToCalendarButton event={event} />}
            />

            <NyuchiMetaTile
              className="mb-6 sm:mb-8"
              icon={isOnline ? Video : MapPin}
              primary={event.location.name}
              secondary={
                isOnline && event.meetingPlatform
                  ? event.meetingPlatform === "zoom"
                    ? "Zoom Meeting"
                    : event.meetingPlatform === "google_meet"
                      ? "Google Meet"
                      : event.meetingPlatform === "teams"
                        ? "Microsoft Teams"
                        : "Online Meeting"
                  : `${event.location.addressLocality}, ${event.location.addressCountry}`
              }
              trailing={
                isOnline && event.meetingUrl ? (
                  <Button variant="secondary" size="sm" onClick={() => window.open(trackedMeetingUrl || event.meetingUrl, "_blank")}>Join</Button>
                ) : (
                  <GetDirectionsButton event={event} />
                )
              }
            />

            {/* Description */}
            <div>
              <h3 className="text-lg font-bold mb-4">About This Event</h3>
              {event.description.split("\n\n").map((paragraph, index) => (
                <p key={index} className="text-[15px] leading-relaxed text-foreground/60 mb-4">{paragraph}</p>
              ))}
            </div>

            {/* Rich venue card backed by places.places (OSM-tied) — surfaces
                the real venue name, address, cover, elevation, accessibility,
                opening hours, activity tags, and an OSM attribution chip
                when the place came from OpenStreetMap. Renders nothing when
                the event has no place_id. */}
            <EventVenueCard placeId={event.placeId} />

            {/* Type-aware specifics — terrain band for outdoor categories,
                programme card for events with rows in events.programme_item.
                Collapses cleanly for categories with neither. */}
            <EventSpecifics event={event} />

            {/* Polls — events.poll + events.poll_vote. Renders nothing
                when no polls exist for this event. */}
            <EventPolls eventId={event.id} />

            {/* Contributions board — chips from events.event.contributor jsonb */}
            <EventContributionsBoard event={event} />

            {/* Campfire — on-page live chat. Only renders when this event
                has a campfire.conversation row linked via
                events.event.campfire_conversation_id. */}
            <CampfireThread conversationId={event.campfireConversationId} />

            {/* Location Section - Luma style: heading, venue, address, map */}
            {isInPerson && (
              <div className="mt-8">
                <Separator className="mb-8" style={{ backgroundColor: "var(--event-surface)" }} />
                <h3 className="text-sm font-medium text-muted-foreground mb-4">Location</h3>
                <h4 className="text-lg font-bold mb-1">{event.location.name}</h4>
                {event.location.streetAddress && (
                  <p className="text-sm text-foreground/60 mb-1">{event.location.streetAddress}</p>
                )}
                <p className="text-sm text-foreground/60 mb-5">
                  {event.location.addressLocality}, {event.location.addressCountry}
                </p>
                <EventMap
                  venue={event.location.name}
                  address={event.location.streetAddress || ""}
                  city={event.location.addressLocality}
                  country={event.location.addressCountry}
                />
              </div>
            )}

            {/* Weather for in-person events */}
            {isInPerson && (
              <div className="mt-6">
                <EventWeather city={event.location.addressLocality} eventDate={event.startDate} />
              </div>
            )}

            {/* Hosted By Section — entity-centric host card (resolves the
                real host — person/family/organization — via the event's
                primaryHostEntityId, with verification badge + reputation
                stats). Replaces a hand-rolled block that showed the raw
                organizer.identifier slug as if it were meaningful copy and
                had two dead buttons ("Subscribe", "Contact the Host" — no
                onClick handler on either) and a Globe icon with no link
                behind it. */}
            <div id="hosted-by" className="mt-10 scroll-mt-20">
              <Separator className="mb-8" style={{ backgroundColor: "var(--event-surface)" }} />
              <EventEntityHostCard eventId={event.id} reviewStats={reviewStats} />
            </div>

            {/* Ratings */}
            {isPastEvent && (
              <div className="mt-10">
                <Separator className="mb-8" style={{ backgroundColor: "var(--event-surface)" }} />
                <EventRatings eventId={event.id} isPastEvent={true} userCanReview={true} />
              </div>
            )}

            {/* Referral Leaderboard */}
            <div className="mt-10">
              <Separator className="mb-8" style={{ backgroundColor: "var(--event-surface)" }} />
              <ReferralLeaderboard
                eventId={event.id}
                userReferralCode={userReferral?.code}
                userReferrals={userReferral?.totalReferrals || 0}
              />
            </div>
          </div>

          <EventSidebar event={event} stats={stats} reviewStats={reviewStats} />
        </div>
      </div>

      {/* Sticky Mobile RSVP + Bookmark Bar */}
      <div className="fixed bottom-0 left-0 right-0 p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] bg-background/90 backdrop-blur-xl border-t border-elevated z-40 lg:hidden">
        <div className="max-w-250 mx-auto flex items-center gap-2.5">
          <LikeButton eventId={event.id} />
          {/* Bookmark / Interested button — persists to the shared engagement substrate */}
          <button
            onClick={() => canSaveEvent && toggleSaved()}
            disabled={!canSaveEvent}
            className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 border transition-colors disabled:opacity-50 ${
              bookmarked
                ? "border-transparent"
                : "border-elevated hover:bg-elevated"
            }`}
            style={bookmarked ? { backgroundColor: "var(--event-surface)", color: "var(--event-primary)" } : undefined}
            aria-label={bookmarked ? "Remove bookmark" : "Bookmark event"}
            aria-pressed={bookmarked}
          >
            <Bookmark className={`w-5 h-5 ${bookmarked ? "fill-current" : ""}`} />
          </button>
          {/* Price + RSVP */}
          <div className="flex-1 min-w-0">
            <RSVPButton eventId={event.id} price={event.offers} />
          </div>
        </div>
      </div>
    </EventThemeWrapper>
  );
}
