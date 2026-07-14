import { notFound } from "next/navigation";
import { cache } from "react";
import type { Metadata } from "next";
import {
  canViewCalendar,
  getCalendarBySlug,
  isFollowingCalendar,
  listCalendarEvents,
} from "@/lib/mongo/calendars";
import { getEntityById } from "@/lib/mongo/entities";
import { getCircleSummary } from "@/lib/mongo/circles";
import { resolveActingPerson } from "@/lib/auth/current-person";
import { CalendarView, type CalendarViewData } from "./calendar-view";

/**
 * /calendars/[slug] — a followable curated event stream (NYU-25, the Luma
 * "calendar" pattern). True SSR: direct Mongo reads, no HTTP hop.
 *
 * Visibility: public + unlisted calendars render for everyone (unlisted are
 * excluded from /discover and the sitemap, and noindexed here); private
 * calendars 404 for anyone but their owner.
 */

interface CalendarPageProps {
  params: Promise<{ slug: string }>;
}

// React cache() dedupes the generateMetadata + page calls into one query per
// request. Errors degrade to null → notFound().
const loadCalendar = cache(async (slug: string) => {
  try {
    return await getCalendarBySlug(slug);
  } catch {
    return null;
  }
});

export async function generateMetadata({ params }: CalendarPageProps): Promise<Metadata> {
  const { slug } = await params;
  const calendar = await loadCalendar(slug);
  if (!calendar || calendar.visibility === "private") {
    // Private calendars never leak name/description through metadata.
    return { title: "Calendar not found - nhimbe", robots: { index: false } };
  }
  const description =
    calendar.description ??
    `Follow ${calendar.name} on nhimbe and never miss a gathering they host.`;
  return {
    title: `${calendar.name} - nhimbe`,
    description,
    // Unlisted calendars render for anyone with the link, but stay out of
    // search indexes (mirroring their exclusion from /discover + sitemap).
    robots: calendar.visibility === "unlisted" ? { index: false } : undefined,
    alternates: { canonical: `https://nhimbe.com/calendars/${calendar.slug}` },
    openGraph: {
      title: calendar.name,
      description,
      type: "website",
      url: `https://nhimbe.com/calendars/${calendar.slug}`,
      siteName: "nhimbe",
    },
  };
}

export default async function CalendarPage({ params }: CalendarPageProps) {
  const { slug } = await params;
  const calendar = await loadCalendar(slug);
  if (!calendar) notFound();

  // Anonymous is fine — the viewer only gates private calendars + follow state.
  const viewer = await resolveActingPerson().catch(() => null);
  if (!canViewCalendar(calendar, viewer?._id ?? null)) notFound();

  const [events, ownerEntity, circle, following] = await Promise.all([
    listCalendarEvents(calendar._id, 100).catch(() => []),
    getEntityById(calendar.ownerEntityId).catch(() => null),
    calendar.circleId ? getCircleSummary(calendar.circleId).catch(() => null) : null,
    viewer ? isFollowingCalendar(calendar._id, viewer._id).catch(() => false) : false,
  ]);

  const view: CalendarViewData = {
    id: calendar._id,
    slug: calendar.slug,
    name: calendar.name,
    description: calendar.description ?? null,
    followerCount: calendar.followerCount ?? 0,
    eventCount: calendar.eventCount ?? 0,
    visibility: calendar.visibility,
    theme: calendar.theme ?? null,
    ownerName: ownerEntity?.name ?? null,
    circle,
  };

  return (
    <CalendarView
      calendar={view}
      events={events}
      isAuthenticated={viewer !== null}
      initialFollowing={following}
    />
  );
}
