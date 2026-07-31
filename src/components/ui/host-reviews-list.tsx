"use client";

import { useMemo, useState } from "react";
import { ChevronDown, Loader2, Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { FilterBar } from "@/components/ui/filter-bar";
import { NyuchiReviewCard } from "@/components/ui/nyuchi-review-card";
import { getEntityReviewsAction } from "@/app/actions/engagement";
import { cn } from "@/lib/utils";

function formatRelativeDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} week${Math.floor(diffDays / 7) > 1 ? "s" : ""} ago`;
  return `${Math.floor(diffDays / 30)} month${Math.floor(diffDays / 30) > 1 ? "s" : ""} ago`;
}

interface HostReview {
  id: string;
  userName: string;
  rating: number;
  reviewBody: string;
  eventTitle?: string;
  date: string;
  helpful: number;
}

/**
 * Searchable, expandable list of reviews written about a host entity, across
 * every event it has run. Collapsed by default — the review list is only
 * fetched once a viewer expands it, keeping the event-detail page's initial
 * load lean.
 */
export function HostReviewsList({ entityId, className }: { entityId: string; className?: string }) {
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [reviews, setReviews] = useState<HostReview[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [ratingFilter, setRatingFilter] = useState<string[]>([]);
  const [helpfulClicked, setHelpfulClicked] = useState<Set<string>>(new Set());

  async function toggle() {
    const next = !expanded;
    setExpanded(next);
    if (next && !loaded) {
      setLoading(true);
      try {
        const data = await getEntityReviewsAction(entityId);
        setReviews(
          data.reviews.map((r) => ({
            id: r.id,
            userName: r.userName,
            rating: r.rating,
            reviewBody: r.reviewBody || "",
            eventTitle: r.eventTitle,
            date: formatRelativeDate(r.dateCreated),
            helpful: r.helpfulCount,
          })),
        );
      } catch (error) {
        console.error("Failed to fetch host reviews:", error);
      } finally {
        setLoading(false);
        setLoaded(true);
      }
    }
  }

  const filteredReviews = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return reviews.filter((review) => {
      if (ratingFilter.length > 0 && !ratingFilter.includes(String(review.rating))) return false;
      if (!query) return true;
      return (
        review.userName.toLowerCase().includes(query) ||
        review.reviewBody.toLowerCase().includes(query) ||
        (review.eventTitle ?? "").toLowerCase().includes(query)
      );
    });
  }, [reviews, searchQuery, ratingFilter]);

  return (
    <div data-slot="host-reviews-list" className={className}>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={expanded}
        className="flex w-full items-center justify-between text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
      >
        Host reviews
        <ChevronDown className={cn("w-4 h-4 transition-transform", expanded && "rotate-180")} />
      </button>

      {expanded && (
        <div className="mt-3 space-y-3">
          {loading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="w-5 h-5 animate-spin text-primary" />
            </div>
          ) : reviews.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">
              No reviews yet for this host.
            </p>
          ) : (
            <>
              {reviews.length > 3 && (
                <div className="space-y-2">
                  <div className="relative">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                    <Input
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search host reviews..."
                      className="pl-10 pr-9 h-9 text-sm"
                      aria-label="Search host reviews"
                    />
                    {searchQuery && (
                      <button
                        type="button"
                        onClick={() => setSearchQuery("")}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        aria-label="Clear search"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                  <FilterBar
                    options={([5, 4, 3, 2, 1] as const).map((stars) => ({
                      id: String(stars),
                      label: `${stars}★`,
                    }))}
                    selected={ratingFilter}
                    onChange={setRatingFilter}
                    mode="single"
                  />
                </div>
              )}

              {filteredReviews.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-4">
                  No reviews match your search.
                </p>
              ) : (
                <div className="space-y-2">
                  {filteredReviews.map((review) => {
                    const marked = helpfulClicked.has(review.id);
                    return (
                      <NyuchiReviewCard
                        key={review.id}
                        reviewer={review.userName}
                        rating={review.rating}
                        text={review.reviewBody}
                        date={review.eventTitle ? `${review.date} · ${review.eventTitle}` : review.date}
                        helpfulCount={review.helpful + (marked ? 1 : 0)}
                        markedHelpful={marked}
                        onHelpful={() =>
                          setHelpfulClicked((prev) => new Set([...prev, review.id]))
                        }
                      />
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
