"use client";

import * as React from "react";
import { Search, X, Sparkles, Loader2, Clock, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { useNyuchiHarness } from "@/components/ui/harness";
import { FilterBar, type FilterOption } from "@/components/ui/filter-bar";
import { NyuchiListingCard, type NyuchiListingMeta } from "@/components/ui/nyuchi-listing-card";
import { NyuchiPlaceCard, type PlaceVerification } from "@/components/ui/nyuchi-place-card";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from "@/components/ui/empty";
import type { Mineral } from "@/lib/category-mineral";

/* ═══════════════════════════════════════════════════════════════
   NYUCHI SEARCH VIEW — brand cross-surface search.

   Composed from nhimbe's existing primitives — a pill search input, the
   FilterBar for category chips, and the listing/place brand cards for
   results — rather than porting new search-bar/search-results primitives.

   Results render as NyuchiListingCard (events/generic) or NyuchiPlaceCard
   (venues) rows. An optional Shamwari AI summary and recent/trending
   sections round out the empty and populated states. Rewired onto the
   harness; the search input's focus ring stays tanzanite (brand primary).
   ═══════════════════════════════════════════════════════════════ */

interface SearchListingResult {
  id: string;
  kind?: "listing";
  title: string;
  description?: string;
  category?: string;
  mineral?: Mineral;
  image?: string;
  href?: string;
  meta?: NyuchiListingMeta[];
  price?: string | number;
  onClick?: () => void;
}

interface SearchPlaceResult {
  id: string;
  kind: "place";
  name: string;
  category?: string;
  address?: string;
  distance?: string;
  rating?: number;
  reviewCount?: number;
  image?: string;
  openNow?: boolean;
  mineral?: Mineral;
  verificationTier?: PlaceVerification;
  href?: string;
  onClick?: () => void;
}

type SearchResultItem = SearchListingResult | SearchPlaceResult;

interface NyuchiSearchViewProps {
  query: string;
  onQueryChange: (query: string) => void;
  placeholder?: string;
  /** Category filter chips (FilterBar). Omit to hide the filter row. */
  categories?: FilterOption[];
  activeCategories?: string[];
  onCategoryChange?: (selected: string[]) => void;
  results?: SearchResultItem[];
  /** Skeletonise the results region while the first page loads. */
  loading?: boolean;
  /** Show an inline spinner beside the result count (background refetch). */
  searching?: boolean;
  /** Shamwari RAG summary rendered above the results. */
  aiSummary?: string;
  recentSearches?: string[];
  onRecentSelect?: (query: string) => void;
  onClearRecent?: () => void;
  trending?: string[];
  onTrendingSelect?: (query: string) => void;
  /** Rendered under the results (e.g. a "view all" link). */
  footer?: React.ReactNode;
  className?: string;
}

function isPlace(r: SearchResultItem): r is SearchPlaceResult {
  return r.kind === "place";
}

export function NyuchiSearchView({
  query,
  onQueryChange,
  placeholder = "Search gatherings, kraals, places…",
  categories,
  activeCategories = [],
  onCategoryChange,
  results = [],
  loading = false,
  searching = false,
  aiSummary,
  recentSearches = [],
  onRecentSelect,
  onClearRecent,
  trending = [],
  onTrendingSelect,
  footer,
  className,
}: NyuchiSearchViewProps) {
  const { animStyle } = useNyuchiHarness("search-view");
  const hasQuery = query.trim().length > 0;
  // Show the results region when the user is querying OR has narrowed by a
  // category chip — so category browsing works without typing.
  const showResults = hasQuery || activeCategories.length > 0;

  return (
    <div data-slot="nyuchi-search-view" style={animStyle()} className={cn("space-y-4", className)}>
      {/* Search input — pill, per the 4.1.0 doctrine. */}
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <input
          type="text"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          aria-label="Search"
          placeholder={placeholder}
          className="h-12 w-full rounded-full border border-border bg-muted pl-11 pr-11 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary)]/40"
        />
        {hasQuery && (
          <button
            type="button"
            onClick={() => onQueryChange("")}
            aria-label="Clear search"
            className="absolute right-3 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        )}
      </div>

      {/* Category filter chips */}
      {categories && categories.length > 0 && (
        <FilterBar
          options={categories}
          selected={activeCategories}
          onChange={onCategoryChange ?? (() => {})}
          mode="single"
        />
      )}

      {/* Shamwari AI summary */}
      {aiSummary && (
        <div className="flex items-start gap-3 rounded-[var(--radius-lg,14px)] border border-primary/20 bg-primary/10 p-4">
          <Sparkles className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
          <p className="text-sm leading-relaxed text-foreground">{aiSummary}</p>
        </div>
      )}

      {/* Results / empty / discovery */}
      {loading ? (
        <div className="space-y-2" aria-busy="true">
          {Array.from({ length: 5 }).map((_, i) => (
            <NyuchiListingCard key={i} variant="row" title="" loading />
          ))}
        </div>
      ) : showResults ? (
        <div>
          <p className="mb-3 flex items-center gap-2 text-sm text-muted-foreground">
            {searching && <Loader2 className="size-3.5 animate-spin" aria-hidden />}
            {results.length} result{results.length !== 1 ? "s" : ""}
            {hasQuery ? <> for &ldquo;{query}&rdquo;</> : null}
          </p>
          {results.length > 0 ? (
            <div className="space-y-2">
              {results.map((r, i) =>
                isPlace(r) ? (
                  <NyuchiPlaceCard
                    key={r.id}
                    variant="row"
                    name={r.name}
                    category={r.category}
                    address={r.address}
                    distance={r.distance}
                    rating={r.rating}
                    reviewCount={r.reviewCount}
                    image={r.image}
                    openNow={r.openNow}
                    mineral={r.mineral}
                    verificationTier={r.verificationTier}
                    href={r.href}
                    onClick={r.onClick}
                  />
                ) : (
                  <NyuchiListingCard
                    key={r.id}
                    variant="row"
                    index={i}
                    title={r.title}
                    description={r.description}
                    category={r.category}
                    mineral={r.mineral}
                    image={r.image}
                    meta={r.meta}
                    price={r.price}
                    href={r.href}
                    onClick={r.onClick}
                  />
                ),
              )}
            </div>
          ) : (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Search />
                </EmptyMedia>
                <EmptyTitle>No results found</EmptyTitle>
                <EmptyDescription>Try different keywords or browse by category.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
          {footer}
        </div>
      ) : (
        <div className="space-y-6">
          {recentSearches.length > 0 && (
            <div>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Recent</p>
                {onClearRecent && (
                  <button
                    type="button"
                    onClick={onClearRecent}
                    className="text-xs font-medium text-primary hover:underline"
                  >
                    Clear
                  </button>
                )}
              </div>
              <div className="space-y-1">
                {recentSearches.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => onRecentSelect?.(s)}
                    className="flex w-full items-center gap-2 rounded-[var(--radius-sm,7px)] px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    <Clock className="size-3.5" aria-hidden />
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
          {trending.length > 0 && (
            <div>
              <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                <TrendingUp className="size-3.5" aria-hidden />
                Trending
              </p>
              <div className="flex flex-wrap gap-1.5">
                {trending.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => onTrendingSelect?.(t)}
                    className="rounded-full bg-muted px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export type { NyuchiSearchViewProps, SearchResultItem, SearchListingResult, SearchPlaceResult };
