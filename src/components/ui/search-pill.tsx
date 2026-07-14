import * as React from "react";
import Link from "next/link";
import { Search, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

interface SearchPillProps {
  /** Where the pill routes. Defaults to the AI search page. */
  href?: string;
  /** Placeholder text shown inside the pill. */
  placeholder?: string;
  /** Accessible label for the link (the visible text is just a placeholder). */
  "aria-label"?: string;
  /**
   * Layout mode:
   * - "inline" (default): flexes to fill a row alongside sibling actions.
   * - "full": stretches to the full width of its container.
   */
  layout?: "inline" | "full";
  className?: string;
}

/**
 * SearchPill — the shared AI search entry point.
 *
 * A Link styled like a search input: a search icon, a placeholder label, and a
 * sodalite "AI" chip that signals Shamwari (the AI assistant) takes over on
 * /search. Styling lives in globals.css (animal-named classes); this component
 * carries no hardcoded colours or sizes.
 */
function SearchPill({
  href = "/search",
  placeholder = "Search gatherings, circles, places…",
  "aria-label": ariaLabel = "Ask Shamwari (AI) to find a gathering",
  layout = "inline",
  className,
}: SearchPillProps) {
  return (
    <Link
      href={href}
      aria-label={ariaLabel}
      data-slot="ai-search-pill"
      className={cn(
        "kudu",
        layout === "full" ? "kudu-wide" : "kudu-inline",
        className,
      )}
    >
      <Search className="w-[17px] h-[17px] shrink-0" aria-hidden />
      <span className="duiker">{placeholder}</span>
      <span className="impala" aria-hidden />
      <span className="springbok">
        <Sparkles className="w-[11px] h-[11px]" strokeWidth={2.2} aria-hidden />
        AI
      </span>
    </Link>
  );
}

export { SearchPill };
export type { SearchPillProps };
