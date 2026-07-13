"use client";

import { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import { Loader2, ArrowRight, Globe, TrendingUp, Flame, Clock, Users, Plus, CalendarDays, Compass, MapPin } from "lucide-react";
import dynamic from "next/dynamic";
import { EventCardHorizontal } from "@/components/ui/event-card-horizontal";
import { Skeleton } from "@/components/ui/skeleton";
import { CityDropdown } from "@/components/ui/city-dropdown";
import { Button } from "@/components/ui/button";
import { FilterBar } from "@/components/ui/filter-bar";
import { SearchPill } from "@/components/ui/search-pill";
import { StatusIndicator } from "@/components/ui/status-indicator";
import { useAuth } from "@/components/auth/auth-context";

const CommunityInsightsCompact = dynamic(
  () => import("@/components/ui/community-insights").then(m => ({ default: m.CommunityInsightsCompact })),
  {
    ssr: false,
    loading: () => <Skeleton className="h-40 w-full rounded-xl" />,
  }
);
import { type Event, type Category, type CommunityStats } from "@/lib/api";
import { getEventsAction, getCategoriesAction, getCommunityStatsAction } from "@/app/actions/discovery";
import { getUserTimezone, getCurrentTimeWithTimezone } from "@/lib/timezone";
import { HomeWeather } from "@/app/home-weather";

// Format large numbers (e.g., 2800 -> "2.8K")
function formatCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}K`;
  return String(n);
}

// Time-of-day greeting. Local time on the client; "Welcome" before hydration.
function useGreeting(): string {
  const [greeting, setGreeting] = useState("Welcome");
  useEffect(() => {
    const h = new Date().getHours();
    if (h < 12) setGreeting("Good morning");
    else if (h < 18) setGreeting("Good afternoon");
    else setGreeting("Good evening");
  }, []);
  return greeting;
}

// First name only — keeps the greeting personal without overflowing on mobile.
function firstName(name?: string | null): string {
  if (!name) return "";
  const first = name.trim().split(/\s+/)[0];
  return first && first.toLowerCase() !== "user" ? first : "";
}

// Honeycomb grain — the Mukoko brand texture rendered as a tiling SVG, masked
// to fade out so it reads as a wash, never as foreground clutter. Mineral hue is
// configurable so the same mark can wear malachite (lead) on the signed-in hero.
function HoneycombBackdrop({ tint = "var(--nh-lead)" }: { tint?: string }) {
  const hex = encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='56' height='100' viewBox='0 0 56 100'><g fill='none' stroke='%23000' stroke-width='2'><path d='M28 0 L56 16 L56 50 L28 66 L0 50 L0 16 Z'/><path d='M28 66 L56 82 L56 116 M28 66 L0 82 L0 116'/></g></svg>`
  );
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      {/* Mineral wash */}
      <div
        className="absolute inset-0 opacity-[0.10] dark:opacity-[0.16]"
        style={{
          backgroundImage: `radial-gradient(900px 360px at 8% -10%, ${tint} 0%, transparent 62%), radial-gradient(720px 320px at 100% 0%, var(--nh-secondary) 0%, transparent 60%)`,
        }}
      />
      {/* Honeycomb tile, faded with a top-down mask */}
      <div
        className="absolute inset-0 opacity-[0.05] dark:opacity-[0.07]"
        style={{
          backgroundImage: `url("data:image/svg+xml,${hex}")`,
          backgroundSize: "56px 100px",
          color: tint,
          WebkitMaskImage: "linear-gradient(to bottom, black, transparent 85%)",
          maskImage: "linear-gradient(to bottom, black, transparent 85%)",
        }}
      />
    </div>
  );
}

// Seed-of-Life mark — the Mukoko flower is ALWAYS the full-colour mark (no
// mono/single-mineral variant, per brand). Each of the seven circles wears a
// mineral; the theme-adaptive mineral tokens keep it legible on light and dark.
function SeedMark({ className }: { className?: string }) {
  const r = 7;
  const d = Math.sqrt(3) * r;
  const centers = [
    [0, 0],
    ...Array.from({ length: 6 }, (_, i) => {
      const a = (Math.PI / 180) * (30 + 60 * i);
      return [Math.cos(a) * d, Math.sin(a) * d];
    }),
  ];
  const petals = [
    "var(--tanzanite)",
    "var(--cobalt)",
    "var(--malachite)",
    "var(--gold)",
    "var(--sodalite)",
    "var(--mineral-copper-raw)",
    "var(--mineral-terracotta-raw)",
  ];
  return (
    <svg viewBox="-20 -20 40 40" className={className} aria-hidden role="presentation">
      {centers.map(([cx, cy], i) => (
        <circle key={i} cx={cx} cy={cy} r={r} fill="none" stroke={petals[i]} strokeWidth={1.4} />
      ))}
    </svg>
  );
}

// Community Stats Bar — 4-col grid with mineral-tinted icons + serif numerals.
// Mirrors Discover.jsx's StatBar from the Claude Design handoff: each cell is
// (icon + uppercase caption) above a serif numeral; cells separated by 1px
// borders inside a single muted container. The icon tint maps a stat to a
// mineral so the eye reads "category" before "number".
function CommunityStatsBar({ eventCount, stats }: { eventCount: number; stats: CommunityStats | null }) {
  const topTrending = stats?.trendingCategories?.[0];
  const trendingLabel = topTrending
    ? `${topTrending.category} ${topTrending.change >= 0 ? "+" : ""}${topTrending.change}%`
    : "—";
  const peakTime = stats?.peakTime || "—";
  const communitySize = stats ? formatCount(stats.totalAttendees) : "—";

  const cells = [
    { label: "Live", value: String(eventCount), Icon: Flame, tint: "var(--nh-lead)" },
    { label: "Trending", value: trendingLabel, Icon: TrendingUp, tint: "var(--nh-accent)" },
    { label: "Peak", value: peakTime, Icon: Clock, tint: "var(--nh-secondary)" },
    { label: "Community", value: `${communitySize}`, Icon: Users, tint: "var(--color-cobalt, var(--mineral-cobalt-raw))" },
  ];

  return (
    <div
      data-slot="stat-bar"
      className="grid grid-cols-2 md:grid-cols-4 gap-0 px-4 py-4 mb-6 rounded-[var(--radius-lg)] bg-muted"
    >
      {cells.map((s, i) => (
        <div
          key={s.label}
          className="flex flex-col gap-1 px-3"
          style={{
            borderLeft: i === 0 ? "none" : "1px solid var(--border)",
          }}
        >
          <span className="inline-flex items-center gap-1.5" style={{ color: s.tint }}>
            <s.Icon className="w-3 h-3" strokeWidth={2.2} aria-hidden />
            <span className="font-sans text-[10px] font-semibold uppercase tracking-[0.04em] text-muted-foreground">
              {s.label}
            </span>
          </span>
          <span className="font-serif text-lg font-bold leading-none text-foreground">{s.value}</span>
        </div>
      ))}
    </div>
  );
}

interface HomeClientProps {
  initialEvents: Event[];
  initialCategories: Category[];
}

export function HomeClient({ initialEvents, initialCategories }: HomeClientProps) {
  const { isAuthenticated, user } = useAuth();
  const greeting = useGreeting();
  const [events, setEvents] = useState<Event[]>(initialEvents);
  const [categories, setCategories] = useState<Category[]>(initialCategories);
  const [loading, setLoading] = useState(false);
  const [activeCategory, setActiveCategory] = useState("All");
  const [activeCity, setActiveCity] = useState<string | null>(null);
  const [detectedCity, setDetectedCity] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState<string>("");
  const [communityStats, setCommunityStats] = useState<CommunityStats | null>(null);

  // Detect user location and timezone on mount. Weather is handled by the
  // HomeWeather dropdown (Mukoko embed), seeded with the timezone city and
  // upgradable via browser geolocation.
  useEffect(() => {
    setCurrentTime(getCurrentTimeWithTimezone());
    const tz = getUserTimezone();
    if (tz.city) {
      setDetectedCity(tz.city);
    }
  }, []);

  // Only fetch client-side if no initial data was provided (fallback)
  useEffect(() => {
    if (initialEvents.length > 0) return;

    async function fetchData() {
      setLoading(true);
      try {
        const [eventsResponse, categoriesData] = await Promise.all([
          getEventsAction({ limit: 50 }),
          getCategoriesAction(),
        ]);

        setEvents(eventsResponse.events);
        setCategories(categoriesData);

        // Set initial city filter based on detected location
        if (!activeCity && eventsResponse.events.length > 0) {
          const cities = new Set(eventsResponse.events.map((e) => e.location.addressLocality));
          if (detectedCity && cities.has(detectedCity)) {
            setActiveCity(detectedCity);
          }
        }
      } catch (error) {
        console.error("Failed to fetch data:", error);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [initialEvents.length, activeCity, detectedCity]);

  // Fetch community stats when city changes
  useEffect(() => {
    getCommunityStatsAction(activeCity || undefined)
      .then(setCommunityStats)
      .catch(() => setCommunityStats(null));
  }, [activeCity]);

  // Get unique cities from events
  const availableCities = useMemo(() => {
    const citySet = new Set(events.map((e) => e.location.addressLocality));
    return Array.from(citySet).sort();
  }, [events]);

  // Set default city once available
  useEffect(() => {
    if (!activeCity && availableCities.length > 0) {
      // Prefer detected city, otherwise first available
      if (detectedCity && availableCities.includes(detectedCity)) {
        setActiveCity(detectedCity);
      } else {
        setActiveCity(availableCities[0]);
      }
    }
  }, [availableCities, activeCity, detectedCity]);

  const filteredEvents = useMemo(() => {
    return events.filter((e) => {
      const categoryMatch = activeCategory === "All" || e.category === activeCategory;
      const cityMatch = !activeCity || e.location.addressLocality === activeCity;
      return categoryMatch && cityMatch;
    });
  }, [events, activeCategory, activeCity]);

  // Split events into two columns for display
  const leftColumnEvents = filteredEvents.filter((_, i) => i % 2 === 0).slice(0, 3);
  const rightColumnEvents = filteredEvents.filter((_, i) => i % 2 === 1).slice(0, 3);

  return (
    <div className="min-h-screen">
      {/* Timezone & Weather Bar */}
      {currentTime && (
        <div className="border-b border-elevated/50">
          <div className="max-w-300 mx-auto px-6 py-2 flex items-center justify-end gap-4 text-sm text-text-tertiary">
            <HomeWeather fallbackCity={detectedCity} />
            <div className="flex items-center gap-2">
              <Globe className="w-4 h-4" />
              <span>{currentTime}</span>
            </div>
          </div>
        </div>
      )}

      {/* Signed-in hero — personalized greeting, brand wash + quick actions.
          Mirrors the public hero's rhythm but leads with the member, not the
          pitch. Honeycomb backdrop wears the lead mineral (malachite). */}
      {isAuthenticated && (
        <section className="relative overflow-hidden pt-10 pb-8 md:pt-14 md:pb-10">
          <HoneycombBackdrop />
          <div className="max-w-300 mx-auto px-6">
            <div className="flex items-center gap-2 mb-3">
              <SeedMark className="w-5 h-5 text-nh-lead" />
              <span className="font-sans text-[11px] font-semibold uppercase tracking-[0.12em] text-nh-lead">
                nhimbe
              </span>
              <StatusIndicator status="live" size="sm" className="ml-1" />
              <span className="text-[11px] font-medium text-text-tertiary">
                {filteredEvents.length} gathering{filteredEvents.length === 1 ? "" : "s"} live
              </span>
            </div>

            <h1 className="font-serif text-3xl md:text-5xl font-bold text-foreground leading-[1.06] tracking-tight">
              {greeting}
              {firstName(user?.name) ? (
                <>
                  , <span className="text-primary">{firstName(user?.name)}</span>
                </>
              ) : null}
            </h1>
            <p className="mt-3 text-base md:text-lg text-text-secondary max-w-150">
              Here&apos;s what&apos;s bringing your community together
              {user?.addressLocality ? <> around <span className="font-medium text-foreground">{user.addressLocality}</span></> : null}.
            </p>

            {/* Quick actions — AI search pill + primary create CTA */}
            <div className="mt-6 flex flex-col sm:flex-row sm:items-center gap-3 max-w-200">
              <SearchPill aria-label="Ask Shamwari (AI) to find a gathering" />
              <Button asChild className="rounded-full h-[var(--touch-target)] px-6 shrink-0">
                <Link href="/events/create">
                  <Plus className="w-4 h-4" aria-hidden />
                  Host a gathering
                </Link>
              </Button>
            </div>

            {/* Quick links — secondary navigation chips */}
            <div className="mt-5 flex flex-wrap items-center gap-2">
              {[
                { href: "/events", label: "Discover", Icon: Compass },
                { href: "/calendar", label: "Calendar", Icon: CalendarDays },
                { href: "/my-events", label: "My events", Icon: CalendarDays },
                { href: "/map", label: "Near me", Icon: MapPin },
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
            </div>
          </div>
        </section>
      )}

      {/* Hero Section — public only */}
      {!isAuthenticated && (
        <section className="py-16 md:py-24 relative overflow-hidden">
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
              Discover <span className="text-primary">gatherings</span>
              <br />
              that move you
            </h1>
            <p className="text-lg text-text-secondary max-w-150 mb-8">
              From cultural celebrations and faith gatherings to tech meetups, comedy nights, music festivals and family days — find what brings your community together. Powered by Ubuntu philosophy.
            </p>
            {/* AI search pill — primary entry point per Nhimbe.html design.
                Full-width entry styled like an input with a sodalite "AI"
                chip at the right; tap routes to /search where Shamwari (the
                AI assistant) takes over. */}
            <div className="max-w-150 mb-6">
              <SearchPill layout="full" aria-label="Ask Shamwari (AI) to find an event" />
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button asChild className="rounded-full h-[var(--touch-target-lg)] px-6">
                <Link href="/events/create">
                  Create Your First Event
                  <ArrowRight className="w-4 h-4" aria-hidden />
                </Link>
              </Button>
            </div>
          </div>
        </section>
      )}

      {/* Popular Events Section */}
      <section className={isAuthenticated ? "pt-4 pb-20 md:pb-16" : "pb-16"}>
        <div className="max-w-300 mx-auto px-6">
          {/* Community Stats Bar - Open Data */}
          <CommunityStatsBar eventCount={filteredEvents.length} stats={communityStats} />

          {/* Section Header with City Selector */}
          <div className="flex items-end justify-between gap-4 mb-6">
            <div>
              <h2 className="font-serif text-2xl md:text-[26px] font-bold text-foreground leading-tight">
                {isAuthenticated ? "Discover near you" : "Popular events"}
              </h2>
              {/* City Dropdown */}
              <div className="mt-1.5">
                <CityDropdown
                  value={activeCity || ""}
                  onChange={setActiveCity}
                  cities={availableCities.map((city) => ({ value: city, label: city }))}
                  displayLabel={activeCity || "All Cities"}
                  variant="subtle"
                />
              </div>
            </div>

            <Link
              href="/events"
              className="flex shrink-0 items-center gap-1.5 text-sm text-text-secondary hover:text-foreground font-medium transition-colors"
            >
              View all
              <ArrowRight className="w-4 h-4" aria-hidden />
            </Link>
          </div>

          {/* Category Filter — horizontal scroll */}
          <FilterBar
            options={categories.map((c) => ({ id: c.id, label: c.name }))}
            selected={activeCategory === "All" ? [] : [activeCategory]}
            onChange={(sel) => setActiveCategory(sel.length > 0 ? sel[0] : "All")}
            mode="single"
            showAll
            className="mb-8"
          />

          {/* Events Grid - Two Columns like Luma */}
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-8 h-8 text-primary animate-spin" />
            </div>
          ) : filteredEvents.length > 0 ? (
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-8">
              {/* Main Events Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-2">
                {/* Left Column */}
                <div className="space-y-2">
                  {leftColumnEvents.map((event) => (
                    <EventCardHorizontal
                      key={event.id}
                      id={event.id}
                      title={event.name}
                      date={event.date}
                      location={event.location}
                      coverImage={event.image}
                      coverGradient={event.coverGradient}
                      attendeeCount={event.attendeeCount}
                      maximumAttendeeCapacity={event.maximumAttendeeCapacity}
                    />
                  ))}
                </div>

                {/* Right Column */}
                <div className="space-y-2">
                  {rightColumnEvents.map((event) => (
                    <EventCardHorizontal
                      key={event.id}
                      id={event.id}
                      title={event.name}
                      date={event.date}
                      location={event.location}
                      coverImage={event.image}
                      coverGradient={event.coverGradient}
                      attendeeCount={event.attendeeCount}
                      maximumAttendeeCapacity={event.maximumAttendeeCapacity}
                    />
                  ))}
                </div>
              </div>

              {/* Sidebar - Community Insights */}
              <aside className="hidden lg:block">
                <CommunityInsightsCompact />

                {/* Open Data Philosophy */}
                <div className="mt-4 p-4 bg-surface rounded-xl border border-elevated">
                  <h4 className="font-semibold text-sm mb-2 flex items-center gap-2">
                    <Globe className="w-4 h-4 text-primary" />
                    Open Data
                  </h4>
                  <p className="text-xs text-text-secondary leading-relaxed">
                    We believe in transparency. View counts, ratings, and community insights are visible to everyone - not locked away for hosts only.
                  </p>
                  <Link
                    href="/about"
                    className="text-xs text-primary font-medium mt-2 inline-block hover:underline"
                  >
                    Learn more →
                  </Link>
                </div>
              </aside>
            </div>
          ) : (
            <div
              data-slot="empty-state"
              className="relative overflow-hidden rounded-[var(--radius-xl)] border border-border bg-card px-6 py-14 md:py-20 text-center"
            >
              <HoneycombBackdrop />
              <div className="mx-auto flex max-w-md flex-col items-center">
                <span
                  className="inline-flex h-16 w-16 items-center justify-center rounded-full"
                  style={{ background: "var(--nh-lead-soft)", color: "var(--nh-lead)" }}
                >
                  <SeedMark className="h-9 w-9" />
                </span>
                <h3 className="mt-5 font-serif text-xl md:text-2xl font-bold text-foreground">
                  {activeCategory !== "All" || (activeCity && availableCities.length > 0)
                    ? "Nothing here just yet"
                    : "Be the first to gather"}
                </h3>
                <p className="mt-2 text-sm md:text-base text-text-secondary">
                  {activeCategory !== "All"
                    ? <>No {activeCategory.toLowerCase()} gatherings{activeCity ? <> in {activeCity}</> : null} right now. Try another category or start one yourself.</>
                    : activeCity && availableCities.length > 0
                      ? <>No gatherings in {activeCity} yet. Switch cities, or be the one who brings people together.</>
                      : <>There are no gatherings to discover yet. Host the first one and set the tone for your community.</>}
                </p>
                <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                  <Button asChild className="rounded-full h-[var(--touch-target)] px-6">
                    <Link href="/events/create">
                      <Plus className="w-4 h-4" aria-hidden />
                      Host a gathering
                    </Link>
                  </Button>
                  {(activeCategory !== "All" || activeCity) && (
                    <Button
                      variant="outline"
                      className="rounded-full h-[var(--touch-target)] px-6"
                      onClick={() => {
                        setActiveCategory("All");
                        if (availableCities.length === 0) setActiveCity(null);
                      }}
                    >
                      Clear filters
                    </Button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* View All Link at bottom */}
          {filteredEvents.length > 6 && (
            <div className="mt-8 text-center">
              <Link
                href="/events"
                className="inline-flex items-center gap-2 text-primary font-medium hover:underline"
              >
                View all {filteredEvents.length} events
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          )}
        </div>
      </section>

      {/* CTA Section — public only */}
      {!isAuthenticated && (
        <section className="py-16 border-t border-elevated">
          <div className="max-w-300 mx-auto px-6 text-center">
            <p className="font-serif italic text-lg text-text-secondary mb-4">
              &ldquo;Together we gather, together we grow&rdquo;
            </p>
            <h2 className="text-2xl font-bold mb-3">Bring people together</h2>
            <p className="text-text-secondary mb-6 max-w-md mx-auto">
              Whether it&apos;s a birthday, a workshop, or a community gathering - create something meaningful.
            </p>
            <Button asChild size="lg" className="rounded-full">
              <Link href="/events/create">
                Create Your First Event
                <ArrowRight className="w-5 h-5" />
              </Link>
            </Button>
            <p className="text-sm text-text-tertiary mt-8">
              A <span className="text-secondary font-semibold">Mukoko</span> Product
            </p>
          </div>
        </section>
      )}
    </div>
  );
}
