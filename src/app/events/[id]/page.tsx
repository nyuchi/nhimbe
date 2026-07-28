import { notFound } from "next/navigation";
import { cache } from "react";
import type { Metadata } from "next";
import { getEventByIdOrSlug } from "@/lib/mongo/events";
import { EventDetailContent } from "./event-detail-content";

interface EventDetailPageProps {
  params: Promise<{ id: string }>;
}

// The root layout reads request cookies via `withAuth()` (WorkOSProvider), which
// makes every route in the app dynamic. This page must therefore render on demand
// too — opting into static generation (a bare `generateStaticParams`) makes Next
// prerender it as SSG, then the runtime cookie read flips it static→dynamic and
// throws "Page changed from static to dynamic at runtime" (HTTP 500). Force
// dynamic so the SEO/detail render always runs per-request, consistent with
// `/events` and the rest of the app.
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

// Dynamic OpenGraph metadata
export async function generateMetadata({ params }: EventDetailPageProps): Promise<Metadata> {
  const { id } = await params;
  const event = await loadEvent(id);

  if (!event) {
    return {
      title: "Event Not Found - Nhimbe",
    };
  }

  const eventUrl = `https://nhimbe.com/events/${event.id}`;
  const shortUrl = `https://nhimbe.com/e/${event.shortCode}`;
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
  const ogImageUrl = `https://nhimbe.com/api/og?${ogImageParams.toString()}`;

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

  const eventUrl = `https://nhimbe.com/e/${event.shortCode}`;

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
      url: `https://nhimbe.com/${(event.organizer.identifier || "").replace("@", "")}`,
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
      <EventDetailContent event={event} />
    </>
  );
}
