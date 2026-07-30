import { notFound } from "next/navigation";
import { cache } from "react";
import type { Metadata } from "next";
import { getEventByIdOrSlug } from "@/lib/mongo/events";
import { SITE_URL } from "@/lib/site-url";
import { EventDetailContent } from "./event-detail-content";
import { syncCurrentUser } from "@/app/actions/auth";
import {
  getEventStatsAction,
  getEventReviewsAction,
  getUserReferralCodeAction,
  generateUserReferralCodeAction,
} from "@/app/actions/engagement";
import type { EventStats, ReviewStats, UserReferralCode } from "@/lib/api";

interface EventDetailPageProps {
  params: Promise<{ id: string }>;
}

// The root layout used to read the session cookie via `withAuth()`
// (WorkOSProvider), which forced every route in the app dynamic — including
// this one, where opting into static generation triggered "Page changed from
// static to dynamic at runtime" (HTTP 500) once the layout's cookie read ran.
// That layout-level read is gone now (see workos-provider.tsx), so this
// page COULD attempt static/ISR generation again — kept force-dynamic
// deliberately for now: RSVPs, host updates and check-ins change often
// enough that per-request freshness is the safer default, and re-enabling
// static generation here needs its own verification pass (this comment's own
// history shows that transition has bitten this page before).
export const dynamic = "force-dynamic";

// Direct Mongo read on the server — events created via the createEvent server
// action are immediately visible here (no dependency on NEXT_PUBLIC_API_URL /
// the retired worker). React cache() dedupes the generateMetadata + page
// calls into one query per request. Errors degrade to null → notFound().
const loadEvent = cache(async (id: string) => {
  try {
    return await getEventByIdOrSlug(id);
  } catch {
    return null;
  }
});

/**
 * Server-side companion data for the event-detail page — stats, review
 * aggregates, and (when signed in) the viewer's referral code. Previously
 * each of these was its own client `useEffect` firing after hydration
 * (three extra round trips, one of them gated behind the client auth
 * context resolving first). Fetched here in parallel and passed down as
 * initial state instead; this page is already `force-dynamic`; so this
 * costs nothing that dynamism wasn't already paying for.
 *
 * The other event-detail subcomponents (venue card, weather, map, campfire,
 * polls, host card, waitlist) still fetch their own data client-side —
 * consolidating those too is a larger, separate pass (each owns its own
 * fetch contract) and is left for later.
 */
async function loadCompanionData(
  eventId: string,
): Promise<{ stats: EventStats | null; reviewStats: ReviewStats | null; userReferral: UserReferralCode | null }> {
  const [stats, reviews, userReferral] = await Promise.all([
    getEventStatsAction(eventId).catch(() => null),
    getEventReviewsAction(eventId).catch(() => null),
    syncCurrentUser()
      .then(async (appUser) => {
        if (!appUser) return null;
        let referral = await getUserReferralCodeAction(appUser.id);
        if (!referral) {
          const result = await generateUserReferralCodeAction(appUser.id);
          referral = { code: result.code, totalReferrals: 0, totalConversions: 0 };
        }
        return referral;
      })
      .catch(() => null),
  ]);
  return { stats, reviewStats: reviews?.stats ?? null, userReferral };
}

// Dynamic OpenGraph metadata
export async function generateMetadata({ params }: EventDetailPageProps): Promise<Metadata> {
  const { id } = await params;
  const event = await loadEvent(id);

  if (!event) {
    return {
      title: "Event Not Found - Nhimbe",
    };
  }

  const eventUrl = `${SITE_URL}/events/${event.id}`;
  const shortUrl = `${SITE_URL}/e/${event.shortCode}`;
  const description = `${event.name} on ${event.date.full} at ${event.location.name}, ${event.location.addressLocality}. ${event.description.slice(0, 150)}...`;

  // Generate dynamic OG image URL with mineral gradient
  const ogImageParams = new URLSearchParams({
    title: event.name,
    subtitle: `${event.date.full} at ${event.location.name}`,
    date: `${event.date.day} ${event.date.month}`,
    location: `${event.location.addressLocality}, ${event.location.addressCountry}`,
    category: event.category,
    gradient: "mixed",
    type: "event",
  });
  const ogImageUrl = `${SITE_URL}/api/og?${ogImageParams.toString()}`;

  // Use cover image if available, otherwise use dynamic OG image
  const imageUrl = event.image || ogImageUrl;

  return {
    title: `${event.name} - Nhimbe`,
    description,
    keywords: [
      event.category,
      ...(event.keywords || []),
      event.location.addressLocality,
      event.location.addressCountry,
      "events",
      "Nhimbe",
    ],
    openGraph: {
      title: event.name,
      description,
      type: "website",
      url: eventUrl,
      siteName: "Nhimbe",
      locale: "en_US",
      images: [
        {
          url: imageUrl,
          width: 1200,
          height: 630,
          alt: event.name,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: event.name,
      description,
      images: [imageUrl],
    },
    alternates: {
      canonical: eventUrl,
    },
    other: {
      "short-url": shortUrl,
    },
  };
}

export default async function EventDetailPage({ params }: EventDetailPageProps) {
  const { id } = await params;
  const event = await loadEvent(id);

  if (!event) {
    notFound();
  }

  const { stats, reviewStats, userReferral } = await loadCompanionData(event.id);

  const eventUrl = `${SITE_URL}/e/${event.shortCode}`;

  // JSON-LD structured data for SEO
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Event",
    name: event.name,
    description: event.description,
    startDate: event.startDate,
    eventStatus: `https://schema.org/${event.eventStatus || "EventScheduled"}`,
    eventAttendanceMode: event.eventAttendanceMode === 'OnlineEventAttendanceMode'
      ? "https://schema.org/OnlineEventAttendanceMode"
      : "https://schema.org/OfflineEventAttendanceMode",
    location: event.eventAttendanceMode === 'OnlineEventAttendanceMode'
      ? {
          "@type": "VirtualLocation",
          url: eventUrl,
        }
      : {
          "@type": "Place",
          name: event.location.name,
          address: {
            "@type": "PostalAddress",
            streetAddress: event.location.streetAddress,
            addressLocality: event.location.addressLocality,
            addressCountry: event.location.addressCountry,
          },
        },
    organizer: {
      "@type": "Organization",
      name: event.organizer.name,
      url: `${SITE_URL}/${(event.organizer.identifier || "").replace("@", "")}`,
    },
    offers: event.offers?.price
      ? {
          "@type": "Offer",
          price: event.offers.price,
          priceCurrency: event.offers.priceCurrency,
          availability: "https://schema.org/InStock",
          url: eventUrl,
        }
      : {
          "@type": "Offer",
          price: 0,
          priceCurrency: "USD",
          availability: "https://schema.org/InStock",
          url: eventUrl,
        },
    image: event.image,
    maximumAttendeeCapacity: event.maximumAttendeeCapacity,
  };

  return (
    <>
      {/* JSON-LD Structured Data */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <EventDetailContent
        event={event}
        initialStats={stats}
        initialReviewStats={reviewStats}
        initialUserReferral={userReferral}
      />
    </>
  );
}
