"use client";

import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { useNyuchiHarness } from "@/components/ui/harness";

/* ═══════════════════════════════════════════════════════════════
   NYUCHI SIDEBAR NAV — brand navigation component.

   Grouped, sectioned sidebar navigation with active state, count
   badges and per-item locking. Ported from mzizi and rewired onto
   nhimbe's harness. Items route via `href` (Next Link) or fire
   `onSelect`; locked items render inert with an optional trailing node.
   ═══════════════════════════════════════════════════════════════ */

interface NavItem {
  key: string;
  label: string;
  icon?: React.ReactNode;
  badge?: number;
  section?: string;
  /** Route to navigate to (renders a Next.js Link). */
  href?: string;
  /** Render inert (e.g. insufficient permission). */
  disabled?: boolean;
  /** Trailing node (e.g. a lock icon) — shown when disabled. */
  trailing?: React.ReactNode;
  /** Native title attribute (tooltip). */
  title?: string;
}

interface NyuchiSidebarNavProps {
  items: NavItem[];
  activeKey?: string;
  onSelect?: (key: string) => void;
  title?: string;
  /** Width utility class (default `w-56`). */
  width?: string;
  className?: string;
}

export function NyuchiSidebarNav({
  items,
  activeKey,
  onSelect,
  title,
  width = "w-56",
  className,
}: NyuchiSidebarNavProps) {
  const { animStyle } = useNyuchiHarness("sidebar-nav");

  const sections = React.useMemo(() => {
    const grouped: Record<string, NavItem[]> = {};
    const order: string[] = [];
    items.forEach((item) => {
      const s = item.section || "_default";
      if (!grouped[s]) {
        grouped[s] = [];
        order.push(s);
      }
      grouped[s].push(item);
    });
    return order.map((s) => [s, grouped[s]] as const);
  }, [items]);

  const itemClasses = (active: boolean, disabled: boolean) =>
    cn(
      "flex w-full items-center justify-between rounded-[var(--radius-sm,7px)] px-3 py-2 text-sm transition-colors min-h-[var(--touch-target-md,40px)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)]",
      disabled
        ? "cursor-not-allowed text-muted-foreground/50"
        : active
          ? "bg-primary/10 font-medium text-primary"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
    );

  const inner = (item: NavItem) => (
    <>
      <span className="flex items-center gap-2">
        {item.icon}
        <span>{item.label}</span>
      </span>
      {item.disabled && item.trailing
        ? item.trailing
        : item.badge != null && item.badge > 0 && (
            <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-bold text-primary-foreground">
              {item.badge}
            </span>
          )}
    </>
  );

  return (
    <nav
      data-slot="nyuchi-sidebar-nav"
      aria-label={title || "Sidebar"}
      style={animStyle()}
      className={cn(width, "shrink-0 overflow-y-auto p-3", className)}
    >
      {title && (
        <p className="mb-3 px-2 font-serif text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {title}
        </p>
      )}
      {sections.map(([section, sectionItems]) => (
        <div key={section} className="mb-2">
          {section !== "_default" && (
            <p className="mb-1 px-2 pt-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60">
              {section}
            </p>
          )}
          {sectionItems.map((item) => {
            const active = activeKey === item.key;
            if (item.disabled) {
              return (
                <div key={item.key} title={item.title} aria-disabled className={itemClasses(false, true)}>
                  {inner(item)}
                </div>
              );
            }
            if (item.href) {
              return (
                <Link
                  key={item.key}
                  href={item.href}
                  title={item.title}
                  aria-current={active ? "page" : undefined}
                  onClick={() => onSelect?.(item.key)}
                  className={itemClasses(active, false)}
                >
                  {inner(item)}
                </Link>
              );
            }
            return (
              <button
                key={item.key}
                type="button"
                title={item.title}
                aria-current={active ? "page" : undefined}
                onClick={() => onSelect?.(item.key)}
                className={itemClasses(active, false)}
              >
                {inner(item)}
              </button>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

export type { NavItem, NyuchiSidebarNavProps };
