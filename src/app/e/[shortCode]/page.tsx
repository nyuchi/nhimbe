import { redirect, notFound } from "next/navigation";
import type { Metadata } from "next";
import { findEventAction, getEventsAction } from "@/app/actions/discovery";
import { SITE_URL } from "@/lib/site-url";

interface ShortCodePageProps {
  params: Promise<{ shortCode: string }>;
}

// Generate static params for all short codes (fetched at build time)
export async function generateStaticParams() {
  try {
    const response = await getEventsAction({ limit: 100 });
    return response.events.map((event) => ({
      shortCode: event.shortCode,
    }));
  } catch {
    return [];
  }
}

// Dynamic metadata for short URL sharing
export async function generateMetadata({ params }: ShortCodePageProps): Promise<Metadata> {
  const { shortCode } = await params;
  const event = await findEventAction(shortCode);

  if (!event) {
    return {
      title: "Event Not Found - Nhimbe",
    };
  }

  const eventUrl = `${SITE_URL}/events/${event.id}`;
  const description = `${event.name} on ${event.date.full} at ${event.location.name}, ${event.location.addressLocality}`;

  return {
    title: `${event.name} - Nhimbe`,
    description,
    openGraph: {
      title: event.name,
      description,
      type: "website",
      url: eventUrl,
      siteName: "Nhimbe",
      images: event.image
        ? [{ url: event.image, width: 1200, height: 630, alt: event.name }]
        : undefined,
    },
    twitter: {
      card: "summary_large_image",
      title: event.name,
      description,
      images: event.image ? [event.image] : undefined,
    },
  };
}

export default async function ShortCodePage({ params }: ShortCodePageProps) {
  const { shortCode } = await params;
  const event = await findEventAction(shortCode);

  if (!event) {
    notFound();
  }

  // Redirect to the full event page
  redirect(`/events/${event.id}`);
}
