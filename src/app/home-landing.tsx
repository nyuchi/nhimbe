import Link from "next/link";
import { ArrowRight, Compass, MapPin, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NyuchiListingCard } from "@/components/ui/nyuchi-listing-card";
import { categoryToMineral } from "@/lib/category-mineral";
import { getMediaUrl, type Event } from "@/lib/api";
import type { CityWithCount } from "@/lib/mongo/lookups";

/**
 * Public home — a lean serif landing, not a feed (NYU-24 IA refresh).
 *
 * Logged-out visitors get one message ("Find your people."), one primary CTA
 * into /discover, city entry chips and at most a single featured event as a
 * teaser. All discovery content lives on /discover; scoped timelines live on
 * /events. Pure presentational server component — data arrives as props from
 * the RSC in page.tsx.
 */

interface HomeLandingProps {
  featuredEvent?: Event | null;
  cities?: Pick<CityWithCount, "addressLocality" | "eventCount">[];
}

export function HomeLanding({ featuredEvent, cities = [] }: HomeLandingProps) {
  return (
    <div className="min-h-screen">
      <section className="relative overflow-hidden py-16 md:py-24">
        {/* Mineral wash backdrop — malachite → tanzanite */}
        <div
          aria-hidden
          className="absolute inset-0 -z-10 opacity-[0.07] dark:opacity-[0.12]"
          style={{
            backgroundImage:
              "radial-gradient(800px 400px at 12% 0%, var(--mineral-malachite-raw) 0%, transparent 60%), radial-gradient(700px 350px at 88% 30%, var(--mineral-tanzanite-raw) 0%, transparent 60%)",
          }}
        />
        <div className="max-w-300 mx-auto px-6">
          <p
            className="font-serif italic text-lg md:text-xl mb-4"
            style={{ color: "color-mix(in srgb, var(--foreground) 70%, transparent)" }}
          >
            &ldquo;Together we gather, together we grow.&rdquo;
          </p>
          <h1 className="font-serif text-4xl md:text-6xl font-bold text-foreground mb-4 leading-[1.05] tracking-tight">
            Find your <span className="text-primary">people</span>.
          </h1>
          <p className="text-lg text-text-secondary max-w-150 mb-8">
            Cultural celebrations, faith gatherings, tech meetups, music, family days — nhimbe is
            where your community comes together.
          </p>

          <div className="flex flex-wrap items-center gap-3 mb-10">
            <Button asChild className="rounded-full h-[var(--touch-target-lg)] px-7">
              <Link href="/discover">
                <Compass className="w-4 h-4" aria-hidden />
                Explore gatherings
                <ArrowRight className="w-4 h-4" aria-hidden />
              </Link>
            </Button>
            <Button asChild variant="outline" className="rounded-full h-[var(--touch-target-lg)] px-7">
              <Link href="/events/create">Host a gathering</Link>
            </Button>
          </div>

          {/* City entry chips — straight into the scoped /events timeline */}
          {cities.length > 0 && (
            <nav aria-label="Explore by city" className="flex flex-wrap items-center gap-2">
              {cities.map((c) => (
                <Link
                  key={c.addressLocality}
                  href={`/events?city=${encodeURIComponent(c.addressLocality)}`}
                  className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-full bg-foreground/5 text-sm font-medium text-foreground/70 hover:bg-foreground/10 hover:text-foreground transition-colors"
                >
                  <MapPin className="w-3.5 h-3.5" aria-hidden />
                  {c.addressLocality}
                  <span className="text-xs text-text-tertiary">{c.eventCount}</span>
                </Link>
              ))}
              <Link
                href="/discover"
                className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-full text-sm font-medium text-primary hover:underline"
              >
                All cities
                <ArrowRight className="w-3.5 h-3.5" aria-hidden />
              </Link>
            </nav>
          )}
        </div>
      </section>

      {/* One featured event as a teaser — never a feed */}
      {featuredEvent && (
        <section className="pb-16" aria-label="Featured gathering">
          <div className="max-w-300 mx-auto px-6">
            <div className="flex items-end justify-between gap-4 mb-4">
              <h2 className="font-serif text-2xl font-bold text-foreground leading-tight">
                Happening soon
              </h2>
              <Link
                href="/discover"
                className="flex shrink-0 items-center gap-1.5 text-sm text-text-secondary hover:text-foreground font-medium transition-colors"
              >
                Discover more
                <ArrowRight className="w-4 h-4" aria-hidden />
              </Link>
            </div>
            <div className="max-w-150">
              <NyuchiListingCard
                variant="hero"
                href={`/events/${featuredEvent.id}`}
                title={featuredEvent.name}
                category={featuredEvent.category}
                mineral={categoryToMineral(featuredEvent.category)}
                image={featuredEvent.image ? getMediaUrl(featuredEvent.image) : undefined}
                meta={[
                  {
                    label: "date",
                    value: `${featuredEvent.date.month} ${featuredEvent.date.day}${featuredEvent.date.time ? ` · ${featuredEvent.date.time}` : ""}`,
                  },
                  {
                    label: "location",
                    value:
                      featuredEvent.location.name || featuredEvent.location.addressLocality || "",
                    icon: MapPin,
                  },
                ]}
              />
            </div>
          </div>
        </section>
      )}

      {/* Closing CTA */}
      <section className="py-10 border-t border-elevated">
        <div className="max-w-300 mx-auto px-6 text-center">
          <Users className="w-6 h-6 mx-auto mb-3 text-primary" aria-hidden />
          <h2 className="text-2xl font-bold mb-3">Bring people together</h2>
          <p className="text-text-secondary mb-6 max-w-md mx-auto">
            Whether it&apos;s a birthday, a workshop, or a community gathering — create something
            meaningful.
          </p>
          <Button asChild size="lg" className="rounded-full">
            <Link href="/events/create">
              Create your first event
              <ArrowRight className="w-5 h-5" aria-hidden />
            </Link>
          </Button>
          <p className="text-sm text-text-tertiary mt-8">
            A <span className="text-secondary font-semibold">Mukoko</span> product
          </p>
        </div>
      </section>
    </div>
  );
}
