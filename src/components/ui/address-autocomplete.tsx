"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { MapPin, Loader2, Database, Globe2 } from "lucide-react";
import { geocodeAddress, type GeocodeSuggestion } from "@/app/actions/geocode";

/**
 * Address autocomplete backed by nhimbe's own places catalogue first and OSM
 * Nominatim as a fallback — no Google Maps, no API key, no third-party script
 * in the browser. Keystrokes are debounced and resolved through the
 * `geocodeAddress` server action (which keeps the browser off both Mongo and
 * the geocoder). DB hits are flagged "In catalogue"; OSM hits "OpenStreetMap".
 *
 * The exported props are unchanged from the previous Google-backed component so
 * every caller keeps working; `AddressComponents` now additionally carries the
 * selected `latitude`/`longitude` and a `timezone` resolved from them
 * (optional — existing callers ignore them).
 */

interface AddressComponents {
  venue: string;
  address: string;
  city: string;
  country: string;
  placeId: string;
  latitude?: number;
  longitude?: number;
  /** IANA timezone resolved from the selected coordinates (e.g. "Africa/Harare"). */
  timezone?: string;
  /** Set only for `source: "osm"` picks — lets the caller promote the
   *  selection into the places catalogue via `ensurePlaceFromOsmSuggestion`. */
  source?: "db" | "osm";
  osmType?: string;
  osmId?: number;
}

interface AddressAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  onPlaceSelect: (components: AddressComponents) => void;
  placeholder?: string;
  className?: string;
}

// Debounce keystrokes before hitting the geocoder. Also the main lever for
// staying within Nominatim's <=1 req/sec etiquette.
const DEBOUNCE_MS = 450;

export function AddressAutocomplete({
  value,
  onChange,
  onPlaceSelect,
  placeholder = "Search for a venue or address...",
  className = "",
}: AddressAutocompleteProps) {
  const [suggestions, setSuggestions] = useState<GeocodeSuggestion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const listboxId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Guards against out-of-order responses overwriting a newer query's results.
  const requestSeq = useRef(0);
  // When we programmatically set the input on select, skip the next search.
  const skipNextSearch = useRef(false);

  const runSearch = useCallback(async (query: string) => {
    const seq = ++requestSeq.current;
    setIsLoading(true);
    try {
      const results = await geocodeAddress(query);
      if (seq !== requestSeq.current) return; // a newer query superseded us
      setSuggestions(results);
      setActiveIndex(-1);
      setIsOpen(results.length > 0);
    } catch {
      if (seq !== requestSeq.current) return;
      setSuggestions([]);
      setIsOpen(false);
    } finally {
      if (seq === requestSeq.current) setIsLoading(false);
    }
  }, []);

  // Debounced search whenever the input value changes.
  useEffect(() => {
    if (skipNextSearch.current) {
      skipNextSearch.current = false;
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);

    const query = value.trim();
    if (query.length < 3) {
      requestSeq.current++; // cancel any in-flight response
      setSuggestions([]);
      setIsOpen(false);
      setIsLoading(false);
      return;
    }

    debounceRef.current = setTimeout(() => runSearch(query), DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [value, runSearch]);

  // Close the list on outside click.
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const handleSelect = useCallback(
    (s: GeocodeSuggestion) => {
      skipNextSearch.current = true;
      onPlaceSelect({
        venue: s.name,
        address: s.address,
        city: s.city,
        country: s.country,
        placeId: s.placeId,
        latitude: s.latitude,
        longitude: s.longitude,
        timezone: s.timezone,
        source: s.source,
        osmType: s.osmType,
        osmId: s.osmId,
      });
      onChange(s.displayName);
      setSuggestions([]);
      setIsOpen(false);
      setActiveIndex(-1);
    },
    [onPlaceSelect, onChange],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (!isOpen || suggestions.length === 0) return;
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setActiveIndex((i) => (i + 1) % suggestions.length);
          break;
        case "ArrowUp":
          e.preventDefault();
          setActiveIndex((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
          break;
        case "Enter":
          if (activeIndex >= 0 && activeIndex < suggestions.length) {
            e.preventDefault();
            handleSelect(suggestions[activeIndex]);
          }
          break;
        case "Escape":
          setIsOpen(false);
          setActiveIndex(-1);
          break;
      }
    },
    [isOpen, suggestions, activeIndex, handleSelect],
  );

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <div className="relative">
        <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-text-tertiary pointer-events-none" />
        <input
          type="text"
          role="combobox"
          aria-expanded={isOpen}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={
            activeIndex >= 0 ? `${listboxId}-option-${activeIndex}` : undefined
          }
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => {
            if (suggestions.length > 0) setIsOpen(true);
          }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="w-full pl-12 pr-10 py-3 bg-surface rounded-xl border-none outline-none text-foreground placeholder:text-text-tertiary"
          autoComplete="off"
        />
        {isLoading && (
          <Loader2 className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-text-tertiary animate-spin" />
        )}
      </div>

      {isOpen && suggestions.length > 0 && (
        <ul
          id={listboxId}
          role="listbox"
          aria-label="Address suggestions"
          className="absolute z-50 mt-2 w-full overflow-hidden rounded-xl border border-elevated bg-surface shadow-lg"
        >
          {suggestions.map((s, i) => (
            <li
              key={s.placeId || `${s.latitude},${s.longitude}`}
              id={`${listboxId}-option-${i}`}
              role="option"
              aria-selected={i === activeIndex}
              onMouseDown={(e) => {
                // mousedown (not click) so selection fires before the input blur.
                e.preventDefault();
                handleSelect(s);
              }}
              onMouseEnter={() => setActiveIndex(i)}
              className={`flex cursor-pointer items-start gap-3 px-4 py-3 text-sm ${
                i === activeIndex ? "bg-elevated" : ""
              }`}
            >
              <span className="mt-0.5 text-text-tertiary" aria-hidden>
                {s.source === "db" ? (
                  <Database className="w-4 h-4" />
                ) : (
                  <Globe2 className="w-4 h-4" />
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium text-foreground">
                  {s.name || s.displayName}
                </span>
                <span className="block truncate text-xs text-text-tertiary">
                  {s.displayName}
                </span>
              </span>
              <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-text-tertiary">
                {s.source === "db" ? "In catalogue" : "OpenStreetMap"}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
