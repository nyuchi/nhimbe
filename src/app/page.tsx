import { withAuth } from "@workos-inc/authkit-nextjs";
import { HomeLanding } from "./home-landing";
import { HomeYourEvents } from "./home-your-events";
import { getMyEvents } from "./actions/my-events";
import { listEvents } from "@/lib/mongo/events";
import { listCitiesWithCounts, type CityWithCount } from "@/lib/mongo/lookups";
import { isDevBypass, DEV_NAME } from "@/lib/auth/dev";
import type { Event } from "@/lib/api";
import { SITE_URL } from "@/lib/site-url";

/**
 * Home (NYU-24 IA refresh) — a simple surface, split server-side on auth:
 *
 * - Logged out → a lean serif landing (one CTA into /discover, city chips,
 *   at most one featured event). No feed, no timeline — discovery lives on
 *   /discover, scoped timelines on /events.
 * - Signed in → "Your events": an Upcoming/Past segmented control over the
 *   member's own RSVPs + hosted gatherings (Luma's "Your events" pattern).
 *
 * Reading the session cookie makes this route dynamic (it was ISR before the
 * refresh); both branches stay SSR-first — Mongo is read here on the server
 * and handed to presentational components.
 */

async function resolveViewer(): Promise<{ signedIn: boolean; firstName: string | null }> {
  if (isDevBypass()) {
    return { signedIn: true, firstName: DEV_NAME.split(/\s+/)[0] ?? null };
  }
  try {
    const { user } = await withAuth();
    if (!user) return { signedIn: false, firstName: null };
    return { signedIn: true, firstName: user.firstName ?? null };
  } catch {
    // Missing/misconfigured WorkOS env (e.g. CI builds) — treat as anonymous.
    return { signedIn: false, firstName: null };
  }
}

async function fetchFeaturedEvent(): Promise<Event | null> {
  try {
    const { events } = await listEvents({ limit: 1 });
    return events[0] ?? null;
  } catch {
    return null;
  }
}

async function fetchCities(): Promise<CityWithCount[]> {
  try {
    return await listCitiesWithCounts(6);
  } catch {
    return [];
  }
}

export default async function HomePage() {
  const viewer = await resolveViewer();

  if (viewer.signedIn) {
    const events = await getMyEvents().catch(() => ({
      attending: [],
      hosting: [],
      past: [],
    }));
    return <HomeYourEvents events={events} userFirstName={viewer.firstName} />;
  }

  const [featuredEvent, cities] = await Promise.all([fetchFeaturedEvent(), fetchCities()]);
  return (
    <>
      {/*
        N11 discovery — schema.org JSON-LD for the site's primary entity, emitted
        on the public (indexable) landing. The Organization + WebSite graph gives
        search engines and AI agents Nhimbe's identity, publisher, and a working
        SearchAction (sitelinks searchbox) that deep-links /search?q=<term>.
      */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(HOME_JSON_LD) }}
      />
      <HomeLanding featuredEvent={featuredEvent} cities={cities} />
    </>
  );
}

const HOME_JSON_LD = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": `${SITE_URL}/#organization`,
      name: "Nhimbe",
      url: SITE_URL,
      logo: `${SITE_URL}/app-icon-512.png`,
      description:
        "Nhimbe is a community events discovery and management platform connecting communities across Africa. A Mukoko product.",
      parentOrganization: {
        "@type": "Organization",
        name: "Mukoko",
        url: "https://mukoko.com",
      },
      sameAs: ["https://mukoko.com"],
    },
    {
      "@type": "WebSite",
      "@id": `${SITE_URL}/#website`,
      url: SITE_URL,
      name: "Nhimbe",
      description: "Together we gather, together we grow",
      publisher: { "@id": `${SITE_URL}/#organization` },
      inLanguage: "en",
      potentialAction: {
        "@type": "SearchAction",
        target: {
          "@type": "EntryPoint",
          urlTemplate: `${SITE_URL}/search?q={search_term_string}`,
        },
        "query-input": "required name=search_term_string",
      },
    },
  ],
};
