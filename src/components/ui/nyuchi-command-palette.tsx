"use client";

/**
 * NyuchiCommandPalette — the ⌘K / Ctrl+K global command palette.
 *
 * Ported from the mzizi N7 `nyuchi-command-palette` (the ecosystem's Vercel/
 * Linear/Raycast-style palette) to the mzizi "search palette" spec: a solid
 * `bg-popover` panel on a dimmed scrim (17px corner), a search input with a
 * spinner, grouped results ("Go to" curated nav + live results), rows with an
 * icon · label · description · mineral-tinted node/category chip, a highlighted
 * selection, a footer key-hint bar, and an empty state.
 *
 * Router-agnostic: the parent supplies `navItems`, an async `onSearch`, and
 * handles navigation via `onSelect(item)` / `onSubmitQuery(query)`. Wired into
 * the header (⌘K) with `/search?q=` as the "search everything" fallback.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Search, CornerDownLeft, Loader2, ArrowUp, ArrowDown, type LucideIcon } from "lucide-react";
import type { Mineral } from "@/lib/category-mineral";
import { useFocusTrap } from "@/lib/use-focus-trap";
import { useNyuchiHarness } from "@/components/ui/harness";
import { cn } from "@/lib/utils";

/** Mineral → chip classes (same convention as nyuchi-listing-card). */
const mineralChip: Record<Mineral, string> = {
  cobalt: "bg-[var(--color-cobalt)]/15 text-[var(--color-cobalt)]",
  tanzanite: "bg-[var(--color-tanzanite)]/15 text-[var(--color-tanzanite)]",
  malachite: "bg-[var(--color-malachite)]/15 text-[var(--color-malachite)]",
  gold: "bg-[var(--color-gold)]/15 text-[var(--color-gold)]",
  terracotta: "bg-[var(--color-terracotta)]/15 text-[var(--color-terracotta)]",
};

export interface CommandPaletteItem {
  id: string;
  label: string;
  description?: string;
  /** Where the item points (used by the parent's onSelect). */
  href: string;
  /** Group heading this item renders under. */
  group: string;
  /** Optional mineral tint for the trailing chip. */
  mineral?: Mineral;
  /** Optional chip label (e.g. a category or "Event"). */
  badge?: string;
  icon?: LucideIcon;
}

export interface NyuchiCommandPaletteProps {
  open: boolean;
  onClose: () => void;
  /** Curated navigation ("Go to"), always available. */
  navItems: CommandPaletteItem[];
  /** Live search — debounced; returns grouped items. Best-effort (may reject). */
  onSearch?: (query: string) => Promise<CommandPaletteItem[]>;
  /** Recent query strings shown when the input is empty. */
  recentQueries?: string[];
  /** Activate an item (parent navigates to item.href). */
  onSelect: (item: CommandPaletteItem) => void;
  /** "Search all events for <query>" — the full-page fallback. */
  onSubmitQuery?: (query: string) => void;
  placeholder?: string;
}

const DEBOUNCE_MS = 250;
const SUBMIT_ID = "__cmd_submit__";

export function NyuchiCommandPalette({
  open,
  onClose,
  navItems,
  onSearch,
  recentQueries = [],
  onSelect,
  onSubmitQuery,
  placeholder = "Search events, or jump to a page…",
}: NyuchiCommandPaletteProps) {
  const { animStyle, announce } = useNyuchiHarness("command-palette");
  const panelRef = useFocusTrap<HTMLDivElement>({ isActive: open });
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CommandPaletteItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState(0);

  // Reset transient state whenever the palette opens.
  useEffect(() => {
    if (open) {
      setQuery("");
      setResults([]);
      setSelected(0);
      // Focus the input on the next frame (after the trap mounts).
      const id = requestAnimationFrame(() => inputRef.current?.focus());
      return () => cancelAnimationFrame(id);
    }
  }, [open]);

  // Body scroll lock while open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Debounced live search.
  useEffect(() => {
    if (!open) return;
    const q = query.trim();
    if (!q || !onSearch) {
      setResults([]);
      setSearching(false);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const handle = setTimeout(async () => {
      try {
        const items = await onSearch(q);
        if (!cancelled) setResults(items);
      } catch {
        if (!cancelled) setResults([]);
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [query, open, onSearch]);

  // Build the flat, grouped item list the palette renders + navigates.
  const items = useMemo<CommandPaletteItem[]>(() => {
    const q = query.trim();
    const out: CommandPaletteItem[] = [];

    if (q) {
      if (onSubmitQuery) {
        out.push({
          id: SUBMIT_ID,
          label: `Search all events for “${q}”`,
          href: `/search?q=${encodeURIComponent(q)}`,
          group: "Search",
          icon: Search,
        });
      }
      const ql = q.toLowerCase();
      const nav = navItems.filter(
        (n) =>
          n.label.toLowerCase().includes(ql) || (n.description ?? "").toLowerCase().includes(ql),
      );
      out.push(...nav, ...results);
    } else {
      out.push(
        ...recentQueries.map<CommandPaletteItem>((r) => ({
          id: `recent:${r}`,
          label: r,
          href: `/search?q=${encodeURIComponent(r)}`,
          group: "Recent",
          icon: Search,
        })),
        ...navItems,
      );
    }
    return out;
  }, [query, navItems, results, recentQueries, onSubmitQuery]);

  // Keep the selection in range as the list changes; announce the count.
  useEffect(() => {
    setSelected((s) => (items.length === 0 ? 0 : Math.min(s, items.length - 1)));
    if (open && query.trim()) announce(`${items.length} result${items.length === 1 ? "" : "s"}`);
  }, [items.length, open, query, announce]);

  const activate = useCallback(
    (item: CommandPaletteItem | undefined) => {
      if (!item) return;
      onClose();
      if (item.id === SUBMIT_ID) onSubmitQuery?.(query.trim());
      else onSelect(item);
    },
    [onClose, onSelect, onSubmitQuery, query],
  );

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelected((s) => (items.length ? (s + 1) % items.length : 0));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelected((s) => (items.length ? (s - 1 + items.length) % items.length : 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        activate(items[selected]);
      }
    },
    [items, selected, activate, onClose],
  );

  if (!open) return null;

  // Group the flat list for rendering while keeping the flat index for nav.
  const groups: { name: string; items: { item: CommandPaletteItem; index: number }[] }[] = [];
  items.forEach((item, index) => {
    const g = groups.find((x) => x.name === item.group);
    if (g) g.items.push({ item, index });
    else groups.push({ name: item.group, items: [{ item, index }] });
  });

  return (
    <div
      data-slot="command-palette"
      className="fixed inset-0 z-[100] flex justify-center bg-[var(--scrim)] px-4 pt-[12vh] pb-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        style={animStyle()}
        onKeyDown={onKeyDown}
        className="flex max-h-[70vh] w-full max-w-[560px] flex-col overflow-hidden rounded-xl border border-elevated bg-popover text-popover-foreground shadow-2xl"
      >
        {/* Input */}
        <div className="flex items-center gap-2.5 border-b border-elevated px-4">
          {searching ? (
            <Loader2 className="size-4 shrink-0 animate-spin text-[var(--primary)]" aria-hidden />
          ) : (
            <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          )}
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={placeholder}
            aria-label="Search"
            role="combobox"
            aria-expanded
            aria-controls="command-palette-list"
            aria-activedescendant={items.length ? `cmd-item-${selected}` : undefined}
            className="flex-1 bg-transparent py-3.5 text-[15px] text-foreground outline-none placeholder:text-muted-foreground"
          />
        </div>

        {/* Results */}
        <div id="command-palette-list" role="listbox" className="flex-1 overflow-y-auto p-2">
          {items.length === 0 ? (
            <p className="px-2 py-9 text-center text-sm text-muted-foreground">
              {query.trim() ? `No matches for “${query.trim()}”.` : "Type to search."}
            </p>
          ) : (
            groups.map((group) => (
              <div key={group.name}>
                <p className="px-2 pb-1 pt-2 text-[11px] font-semibold tracking-wide text-muted-foreground">
                  {group.name}
                </p>
                {group.items.map(({ item, index }) => {
                  const Icon = item.icon ?? Search;
                  const isSel = index === selected;
                  return (
                    <button
                      key={item.id}
                      id={`cmd-item-${index}`}
                      role="option"
                      aria-selected={isSel}
                      type="button"
                      onMouseEnter={() => setSelected(index)}
                      onClick={() => activate(item)}
                      className={cn(
                        "flex min-h-11 w-full items-center gap-3 rounded-[var(--radius-sm)] px-2.5 py-2 text-left",
                        isSel && "bg-foreground/5",
                      )}
                    >
                      <Icon
                        className={cn(
                          "size-4 shrink-0",
                          isSel ? "text-[var(--primary)]" : "text-muted-foreground",
                        )}
                        aria-hidden
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm text-foreground">{item.label}</span>
                        {item.description && (
                          <span className="block truncate text-xs text-muted-foreground">
                            {item.description}
                          </span>
                        )}
                      </span>
                      {item.badge && (
                        <span
                          className={cn(
                            "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold",
                            mineralChip[item.mineral ?? "tanzanite"],
                          )}
                        >
                          {item.badge}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>

        {/* Footer key hints */}
        <div className="flex items-center gap-4 border-t border-elevated px-4 py-2.5 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <Kbd>
              <ArrowUp className="size-3" />
            </Kbd>
            <Kbd>
              <ArrowDown className="size-3" />
            </Kbd>
            navigate
          </span>
          <span className="flex items-center gap-1.5">
            <Kbd>
              <CornerDownLeft className="size-3" />
            </Kbd>
            select
          </span>
          <span className="ml-auto flex items-center gap-1.5">
            <Kbd>esc</Kbd>
            close
          </span>
        </div>
      </div>
    </div>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex min-w-[18px] items-center justify-center rounded-[5px] border border-elevated bg-muted px-1.5 py-0.5 font-mono text-[10.5px] leading-none text-muted-foreground">
      {children}
    </kbd>
  );
}
