"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { ArrowRight, Clock, MapPin } from "lucide-react";
import { type Event, type Category, getMediaUrl } from "@/lib/api";
import { getEventsAction, getCategoriesAction } from "@/app/actions/discovery";
import { searchEventsAction } from "@/app/actions/search";
import { NyuchiSearchView, type SearchResultItem } from "@/components/ui/nyuchi-search-view";
import { categoryToMineral } from "@/lib/category-mineral";

export default function SearchPage() {
  const [events, setEvents] = useState<Event[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategories, setActiveCategories] = useState<string[]>([]);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  // Semantic (RAG) results from the server action. Preferred when present;
  // otherwise we fall back to the local substring filter below so search keeps
  // working even before the Atlas vector index is populated.
  const [semanticEvents, setSemanticEvents] = useState<Event[] | null>(null);
  const [aiSummary, setAiSummary] = useState<string>("");
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    async function fetchData() {
      try {
        const [eventsResponse, categoriesData] = await Promise.all([
          getEventsAction({ limit: 100 }),
          getCategoriesAction(),
        ]);
        setEvents(eventsResponse.events);
        setCategories(categoriesData);
      } catch (error) {
        console.error("Failed to fetch data:", error);
      } finally {
        setLoading(false);
      }
    }
    fetchData();

    const stored = localStorage.getItem("nhimbe-recent-searches");
    if (stored) {
      setRecentSearches(JSON.parse(stored));
    }
  }, []);

  // Deep-link support: seed the query from `?q=` so /search?q=<term> works for
  // shared links, the homepage WebSite SearchAction (sitelinks searchbox), and
  // AI agents deep-linking a search. Read from window.location (client-only) to
  // avoid a useSearchParams Suspense boundary on this leaf page.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("q");
    if (q) setSearchQuery(q);
  }, []);

  const saveSearch = (query: string) => {
    if (!query.trim()) return;
    setRecentSearches((prev) => {
      const updated = [query, ...prev.filter((s) => s !== query)].slice(0, 5);
      localStorage.setItem("nhimbe-recent-searches", JSON.stringify(updated));
      return updated;
    });
  };

  const clearRecentSearches = () => {
    setRecentSearches([]);
    localStorage.removeItem("nhimbe-recent-searches");
  };

  const localFiltered = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const query = searchQuery.toLowerCase();
    return events.filter(
      (e) =>
        e.name.toLowerCase().includes(query) ||
        e.description.toLowerCase().includes(query) ||
        e.category.toLowerCase().includes(query) ||
        e.location.addressLocality.toLowerCase().includes(query) ||
        e.location.name.toLowerCase().includes(query) ||
        (e.keywords || []).some((tag) => tag.toLowerCase().includes(query))
    );
  }, [events, searchQuery]);

  // Debounced semantic search via the server action (Atlas Vector Search +
  // Shamwari gateway). Runs 300ms after the query settles; results override the
  // local filter when the server returns matches.
  useEffect(() => {
    const q = searchQuery.trim();
    if (!q) {
      setSemanticEvents(null);
      setAiSummary("");
      setSearching(false);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const handle = setTimeout(async () => {
      try {
        // Push a single active category into the server query so filtering
        // happens in the index, not only in the client refinement below.
        // (Multi-select still narrows client-side.)
        const category = activeCategories.length === 1 ? activeCategories[0] : undefined;
        const result = await searchEventsAction({ query: q, limit: 30, category });
        if (cancelled) return;
        setSemanticEvents(result.events);
        setAiSummary(result.events.length > 0 ? result.aiSummary : "");
      } catch {
        if (!cancelled) {
          setSemanticEvents(null);
          setAiSummary("");
        }
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [searchQuery, activeCategories]);

  // Prefer server (semantic/text) results; fall back to the local substring
  // filter. When there's no query, category chips narrow the full catalogue.
  const baseEvents = searchQuery.trim()
    ? semanticEvents && semanticEvents.length > 0
      ? semanticEvents
      : localFiltered
    : events;

  const filteredEvents = useMemo(() => {
    if (activeCategories.length === 0) return baseEvents;
    const active = new Set(activeCategories.map((c) => c.toLowerCase()));
    return baseEvents.filter((e) => active.has(e.category.toLowerCase()));
  }, [baseEvents, activeCategories]);

  const results: SearchResultItem[] = useMemo(
    () =>
      filteredEvents.map((event) => ({
        id: event.id,
        title: event.name,
        description: event.description,
        category: event.category,
        mineral: categoryToMineral(event.category),
        image: event.image ? getMediaUrl(event.image) : undefined,
        href: `/events/${event.id}`,
        date: event.startDate,
        time: event.date.time,
        host: event.organizer?.name,
        location: event.location.name || event.location.addressLocality,
        attendeeCount: event.attendeeCount,
        meta: [
          { icon: Clock, label: "date", value: event.date.full },
          { icon: MapPin, label: "venue", value: event.location.addressLocality },
        ],
      })),
    [filteredEvents]
  );

  const filterOptions = useMemo(
    () => categories.map((c) => ({ id: c.name, label: c.name })),
    [categories]
  );

  const trending = useMemo(() => categories.slice(0, 6).map((c) => c.name), [categories]);

  return (
    <div className="mx-auto max-w-200 px-6 py-8">
      <NyuchiSearchView
        query={searchQuery}
        onQueryChange={setSearchQuery}
        placeholder="Search events, venues, or categories…"
        categories={filterOptions}
        activeCategories={activeCategories}
        onCategoryChange={setActiveCategories}
        results={results}
        loading={loading}
        searching={searching}
        aiSummary={aiSummary}
        recentSearches={recentSearches}
        onRecentSelect={(s) => setSearchQuery(s)}
        onClearRecent={clearRecentSearches}
        trending={trending}
        onTrendingSelect={(t) => setSearchQuery(t)}
        timeline
      />

      {/* Persist a recent search once the query settles with matches. */}
      <RecentSearchSaver query={searchQuery} count={results.length} onSave={saveSearch} />

      {events.length > 0 && !searchQuery.trim() && activeCategories.length === 0 && (
        <div className="mt-8">
          <Link
            href="/events"
            className="flex items-center justify-center gap-2 py-3 text-sm font-medium text-primary transition-colors hover:text-primary/80"
          >
            Browse all events
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      )}
    </div>
  );
}

/**
 * Persist a recent search after a query settles with at least one match.
 * Kept as a tiny effect component so the page body stays declarative.
 */
function RecentSearchSaver({
  query,
  count,
  onSave,
}: {
  query: string;
  count: number;
  onSave: (q: string) => void;
}) {
  useEffect(() => {
    const q = query.trim();
    if (!q || count === 0) return;
    const handle = setTimeout(() => onSave(q), 800);
    return () => clearTimeout(handle);
    // onSave is stable enough for this debounce; re-run on query/count changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, count]);
  return null;
}
