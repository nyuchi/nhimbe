import Link from "next/link";
import {
  ArrowRight,
  CalendarDays,
  CalendarRange,
  Landmark,
  Leaf,
  MapIcon,
  MapPin,
  Search,
  Sparkles,
  Sun,
  Users,
  Zap,
} from "lucide-react";
import { categoryToMineral, type Mineral } from "@/lib/category-mineral";
import { getTheme } from "@/lib/themes";
import type { CategoryWithCount, CityWithCount } from "@/lib/mongo/lookups";
import type { FeaturedCircle } from "@/lib/mongo/circles";
import type { FeaturedCalendar } from "@/lib/mongo/calendars";
import { CreateCalendarCta } from "./create-calendar-cta";

/**
 * /discover browse sections (NYU-24 IA refresh) — a BROWSE surface, not a
 * feed: category tiles → featured circles → featured calendars (NYU-25) →
 * cities. Every tile/card links into a scoped drill-down (the /events
 * timeline, a circle page, or a calendar page); the timeline itself never
 * renders here. Pure presentational server component.
 *
 * Circles vs calendars, kept distinct on purpose: a circle is a COMMUNITY
 * you join; a calendar is an EVENT STREAM you follow.
 */

interface DiscoverBrowseProps {
  categories: CategoryWithCount[];
  circles: FeaturedCircle[];
  calendars: FeaturedCalendar[];
  cities: CityWithCount[];
}

/* Mineral-tinted tile accents (category cue only — brand primary stays
   tanzanite). */
const mineralTint: Record<Mineral, string> = {
  cobalt: "bg-[var(--color-cobalt)]/12 text-[var(--color-cobalt)]",
  tanzanite: "bg-primary/12 text-primary",
  malachite: "bg-[var(--color-malachite)]/12 text-[var(--color-malachite)]",
  gold: "bg-[var(--color-gold)]/12 text-[var(--color-gold)]",
  terracotta: "bg-[var(--color-terracotta)]/12 text-[var(--color-terracotta)]",
};

const mineralIcon: Record<Mineral, React.ComponentType<{ className?: string }>> = {
  cobalt: Zap,
  tanzanite: Sparkles,
  malachite: Leaf,
  gold: Sun,
  terracotta: Landmark,
};

/** Join affordance per circleType — a cue, not a mutation (join happens on
 *  the circle page). */
const joinLabel: Record<FeaturedCircle["circleType"], string> = {
  public: "Join",
  private: "Request to join",
  broadcast: "Follow",
};

function SectionHeader({
  title,
  subtitle,
  viewAllHref,
  viewAllLabel,
}: {
  title: string;
  subtitle?: string;
  viewAllHref?: string;
  viewAllLabel?: string;
}) {
  return (
    <div className="flex items-end justify-between gap-4 mb-5">
      <div>
        <h2 className="font-serif text-2xl md:text-[26px] font-bold text-foreground leading-tight">
          {title}
        </h2>
        {subtitle && <p className="text-sm text-text-secondary mt-1">{subtitle}</p>}
      </div>
      {viewAllHref && (
        <Link
          href={viewAllHref}
          className="flex shrink-0 items-center gap-1.5 text-sm text-text-secondary hover:text-foreground font-medium transition-colors"
        >
          {viewAllLabel ?? "View all"}
          <ArrowRight className="w-4 h-4" aria-hidden />
        </Link>
      )}
    </div>
  );
}

export function DiscoverBrowse({ categories, circles, calendars, cities }: DiscoverBrowseProps) {
  return (
    <div className="max-w-300 mx-auto px-6 py-8 md:py-10">
      {/* Page header */}
      <header className="mb-8">
        <h1 className="font-serif text-3xl md:text-4xl font-bold text-foreground leading-tight tracking-tight">
          Discover
        </h1>
        <p className="text-text-secondary mt-1.5 max-w-150">
          Browse by category, find your circles, or explore what&apos;s happening in your city.
        </p>
        {/* Quiet secondary entries into the other discovery surfaces */}
        <nav aria-label="More ways to explore" className="mt-4 flex flex-wrap items-center gap-2">
          {[
            { href: "/events", label: "All events", Icon: CalendarDays },
            { href: "/map", label: "Near me", Icon: MapIcon },
            { href: "/search", label: "Search", Icon: Search },
          ].map(({ href, label, Icon }) => (
            <Link
              key={href}
              href={href}
              className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-full bg-foreground/5 text-sm font-medium text-foreground/70 hover:bg-foreground/10 hover:text-foreground transition-colors"
            >
              <Icon className="w-3.5 h-3.5" aria-hidden />
              {label}
            </Link>
          ))}
        </nav>
      </header>

      {/* 1 — Browse by category */}
      <section aria-labelledby="discover-categories" className="mb-12">
        <SectionHeader
          title="Browse by category"
          subtitle="Pick a lane — each tile opens a live timeline."
          viewAllHref="/events"
          viewAllLabel="All events"
        />
        <span id="discover-categories" className="sr-only">
          Browse by category
        </span>
        {categories.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {categories.map((c) => {
              const mineral = categoryToMineral(c.name);
              const Icon = mineralIcon[mineral];
              return (
                <Link
                  key={c.id}
                  href={`/events?category=${encodeURIComponent(c.id)}`}
                  className="group flex items-center gap-3 rounded-[var(--radius-card,14px)] border border-border bg-card px-3.5 py-3.5 transition-shadow hover:shadow-md"
                >
                  <span
                    className={`inline-flex size-10 shrink-0 items-center justify-center rounded-xl ${mineralTint[mineral]}`}
                    aria-hidden
                  >
                    <Icon className="w-5 h-5" />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-foreground group-hover:text-primary transition-colors">
                      {c.name}
                    </span>
                    <span className="block text-[13px] text-muted-foreground">
                      {c.eventCount} {c.eventCount === 1 ? "event" : "events"}
                    </span>
                  </span>
                </Link>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-text-secondary">Categories are warming up — check back soon.</p>
        )}
      </section>

      {/* 2 — Featured circles (communities, presented through an events lens) */}
      <section aria-labelledby="discover-circles" className="mb-12">
        <SectionHeader
          title="Featured circles"
          subtitle="Communities that gather here — join one and never miss their events."
          viewAllHref="/circles"
          viewAllLabel="Your circles"
        />
        <span id="discover-circles" className="sr-only">
          Featured circles
        </span>
        {circles.length > 0 ? (
          <ul className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {circles.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/circles/${c.id}`}
                  className="group flex items-center gap-4 rounded-[var(--radius-card,14px)] border border-border bg-card px-4 py-3.5 transition-shadow hover:shadow-md"
                >
                  <span
                    className="flex size-12 shrink-0 items-center justify-center rounded-xl text-primary-foreground font-bold text-lg"
                    style={{
                      background:
                        "linear-gradient(135deg, var(--heritage-savanna), var(--heritage-baobab))",
                    }}
                    aria-hidden
                  >
                    {c.name.trim().slice(0, 1).toUpperCase() || "•"}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-foreground group-hover:text-primary transition-colors">
                      {c.name}
                    </span>
                    {c.description && (
                      <span className="block text-[13px] text-muted-foreground line-clamp-2">
                        {c.description}
                      </span>
                    )}
                    <span className="mt-1 inline-flex items-center gap-1 text-xs text-text-tertiary">
                      <Users className="w-3 h-3" aria-hidden />
                      {c.memberCount} {c.memberCount === 1 ? "member" : "members"}
                    </span>
                  </span>
                  <span className="shrink-0 inline-flex items-center h-8 px-3.5 rounded-full bg-primary/10 text-primary text-xs font-semibold">
                    {joinLabel[c.circleType]}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-text-secondary">
            No circles to feature yet — hosts open one alongside their events.
          </p>
        )}
      </section>

      {/* 3 — Featured calendars (followable event streams — NOT communities) */}
      <section aria-labelledby="discover-calendars" className="mb-12">
        <div className="flex items-end justify-between gap-4">
          <SectionHeader
            title="Featured calendars"
            subtitle="Curated event streams — follow one and every gathering lands on your radar."
          />
          <CreateCalendarCta />
        </div>
        <span id="discover-calendars" className="sr-only">
          Featured calendars
        </span>
        {calendars.length > 0 ? (
          <ul className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {calendars.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/calendars/${c.slug}`}
                  className="group flex items-center gap-4 rounded-[var(--radius-card,14px)] border border-border bg-card px-4 py-3.5 transition-shadow hover:shadow-md"
                >
                  {/* Cover thumb — the calendar's washed theme gradient. */}
                  <span
                    className="flex size-12 shrink-0 items-center justify-center rounded-xl text-primary-foreground"
                    style={{ background: getTheme(c.theme ?? undefined).gradient }}
                    aria-hidden
                  >
                    <CalendarRange className="w-5 h-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-foreground group-hover:text-primary transition-colors">
                      {c.name}
                    </span>
                    {c.description && (
                      <span className="block text-[13px] text-muted-foreground line-clamp-2">
                        {c.description}
                      </span>
                    )}
                    <span className="mt-1 inline-flex items-center gap-1 text-xs text-text-tertiary">
                      <Users className="w-3 h-3" aria-hidden />
                      {c.followerCount} {c.followerCount === 1 ? "follower" : "followers"}
                    </span>
                  </span>
                  {/* Follow is a cue, not a mutation — following happens on
                      the calendar page (auth-gated there). */}
                  <span className="shrink-0 inline-flex items-center h-8 px-3.5 rounded-full bg-primary/10 text-primary text-xs font-semibold">
                    Follow
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-text-secondary">
            No calendars to follow yet — hosts curate them from their events.
          </p>
        )}
      </section>

      {/* 4 — Explore by city */}
      <section aria-labelledby="discover-cities" className="mb-4">
        <SectionHeader
          title="Explore by city"
          subtitle="Where the gatherings are happening right now."
          viewAllHref="/map"
          viewAllLabel="Open the map"
        />
        <span id="discover-cities" className="sr-only">
          Explore by city
        </span>
        {cities.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {cities.map((c) => (
              <Link
                key={c.addressLocality}
                href={`/events?city=${encodeURIComponent(c.addressLocality)}`}
                className="group rounded-[var(--radius-card,14px)] border border-border bg-card px-4 py-4 transition-shadow hover:shadow-md"
              >
                <span className="flex items-center gap-2 text-sm font-semibold text-foreground group-hover:text-primary transition-colors">
                  <MapPin className="w-4 h-4 text-primary" aria-hidden />
                  <span className="truncate">{c.addressLocality}</span>
                </span>
                <span className="mt-1 block text-[13px] text-muted-foreground">
                  {c.eventCount} upcoming {c.eventCount === 1 ? "event" : "events"}
                  {c.addressCountry ? ` · ${c.addressCountry}` : ""}
                </span>
              </Link>
            ))}
          </div>
        ) : (
          <p className="text-sm text-text-secondary">
            No cities with upcoming events yet — be the first to{" "}
            <Link href="/events/create" className="text-primary hover:underline">
              host one
            </Link>
            .
          </p>
        )}
      </section>
    </div>
  );
}
