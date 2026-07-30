"use client";

import { useState, useEffect, useSyncExternalStore, useMemo, useCallback } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import {
  Plus,
  Search,
  LogIn,
  User,
  Ticket,
  Heart,
  Settings,
  Compass,
  CalendarDays,
  Users,
  Info,
} from "lucide-react";
import { useAuth } from "@/components/auth/auth-context";
import { NyuchiUserMenu, type UserMenuItem } from "@/components/ui/nyuchi-user-menu";
import {
  NyuchiCommandPalette,
  type CommandPaletteItem,
} from "@/components/ui/nyuchi-command-palette";
import { searchEventsAction } from "@/app/actions/search";
import { categoryToMineral } from "@/lib/category-mineral";

/** Curated "Go to" navigation for the ⌘K command palette. */
const PALETTE_NAV: CommandPaletteItem[] = [
  { id: "nav:discover", label: "Discover", href: "/discover", group: "Go to", icon: Compass },
  { id: "nav:events", label: "All Events", href: "/events", group: "Go to", icon: CalendarDays },
  { id: "nav:my-events", label: "My Events", href: "/my-events", group: "Go to", icon: Ticket },
  { id: "nav:calendar", label: "Calendar", href: "/calendar", group: "Go to", icon: CalendarDays },
  { id: "nav:create", label: "Create an Event", href: "/events/create", group: "Go to", icon: Plus },
  { id: "nav:circles", label: "Circles", href: "/circles", group: "Go to", icon: Users },
  { id: "nav:profile", label: "Profile", href: "/profile", group: "Go to", icon: User },
  { id: "nav:about", label: "About", href: "/about", group: "Go to", icon: Info },
];

const RECENT_KEY = "nhimbe-recent-searches";

/** Live palette search — top few events, mapped to command items. */
async function searchPalette(query: string): Promise<CommandPaletteItem[]> {
  try {
    const { events } = await searchEventsAction({ query, limit: 6 });
    return events.map((e) => ({
      id: `event:${e.id}`,
      label: e.name,
      description: [e.date?.full, e.location?.name || e.location?.addressLocality]
        .filter(Boolean)
        .join(" · "),
      href: `/events/${e.id}`,
      group: "Events",
      mineral: categoryToMineral(e.category),
      badge: e.category || "Event",
    }));
  } catch {
    return [];
  }
}

const navLinks = [
  { href: "/discover", label: "Discover" },
  { href: "/my-events", label: "My Events" },
  { href: "/calendar", label: "Calendar" },
  { href: "/circles", label: "Circles" },
];

// Static page titles mapping
const pageTitles: Record<string, string> = {
  "/": "Home",
  "/discover": "Discover",
  "/events": "All Events",
  "/circles": "Circles",
  "/my-events": "My Events",
  "/calendar": "Calendar",
  "/about": "About",
  "/help": "Help Center",
  "/terms": "Terms of Service",
  "/privacy": "Privacy Policy",
  "/events/create": "Create Event",
  "/search": "Search",
  "/profile": "Profile",
};

// Create a subscription for H1 element changes
function createH1Subscription(pathname: string) {
  return function subscribeToH1(callback: () => void) {
    // Check static title first - no subscription needed
    if (pageTitles[pathname]) {
      return () => {};
    }

    // For dynamic pages, observe DOM changes
    const observer = new MutationObserver(callback);
    observer.observe(document.body, { childList: true, subtree: true });

    // Also trigger after a delay for initial render
    const timer = setTimeout(callback, 100);

    return () => {
      observer.disconnect();
      clearTimeout(timer);
    };
  };
}

function getPageTitleSnapshot(pathname: string): string | null {
  // Check static mapping first
  const staticTitle = pageTitles[pathname];
  if (staticTitle) return staticTitle;

  // For dynamic pages, get from H1
  if (typeof window === "undefined") return null;
  const h1 = document.querySelector("h1");
  return h1?.textContent || null;
}

export function Header() {
  const pathname = usePathname();
  const router = useRouter();
  const [isScrolled, setIsScrolled] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [recentQueries, setRecentQueries] = useState<string[]>([]);
  const { user, isAuthenticated, isLoading, signOut } = useAuth();

  // Load recent searches (shared key with the /search page) when the palette opens.
  useEffect(() => {
    if (!paletteOpen) return;
    try {
      const stored = localStorage.getItem(RECENT_KEY);
      if (stored) setRecentQueries(JSON.parse(stored));
    } catch {
      /* ignore malformed storage */
    }
  }, [paletteOpen]);

  const commitQuery = useCallback(
    (q: string) => {
      const query = q.trim();
      if (!query) return;
      try {
        const next = [query, ...recentQueries.filter((s) => s !== query)].slice(0, 5);
        localStorage.setItem(RECENT_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      router.push(`/search?q=${encodeURIComponent(query)}`);
    },
    [recentQueries, router],
  );

  const userName = user?.name;

  // Account dropdown items — surfaced through the branded user menu.
  const userMenuItems: UserMenuItem[] = useMemo(
    () => [
      { label: "Profile", icon: User, href: "/profile" },
      { label: "My Tickets", icon: Ticket, href: "/my-events" },
      { label: "Saved Events", icon: Heart, href: "/my-events?tab=saved" },
      { label: "Edit Profile", icon: Settings, href: "/profile/edit" },
    ],
    [],
  );

  const handleSignOut = useCallback(async () => {
    await signOut();
    router.push("/");
  }, [signOut, router]);

  // Memoize the subscription function based on pathname
  const subscribeToH1 = useMemo(() => createH1Subscription(pathname), [pathname]);

  // Get page title snapshot
  const getSnapshot = useMemo(() => () => getPageTitleSnapshot(pathname), [pathname]);

  // Use useSyncExternalStore for page title - React 19 compliant
  const pageTitle = useSyncExternalStore(
    subscribeToH1,
    getSnapshot,
    () => pageTitles[pathname] || null // Server snapshot
  );

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };

    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Cmd+K / Ctrl+K keyboard shortcut for search
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    },
    [router]
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  return (
    <header
      className={`sticky top-0 z-50 transition-all duration-300 pt-[env(safe-area-inset-top,0px)] ${
        isScrolled
          ? "bg-background/70 backdrop-blur-xl border-b border-elevated/50 shadow-sm"
          : ""
      }`}
    >
      <div className="max-w-300 mx-auto px-6 py-3 sm:py-4 flex items-center justify-between">
        {/* Logo / Page Title */}
        <Link href="/" className="min-w-0 shrink flex items-center gap-3">
          {/* Mukoko Seed-of-Life mark — full palette at 34px (>=32px per brand) */}
          <div className="rhino w-8.5 h-8.5 bg-surface border border-elevated">
            <Image
              src="/mukoko-mark-full-light.svg"
              alt="Nhimbe"
              width={34}
              height={34}
              className="zebra zebra-light"
            />
            <Image
              src="/mukoko-mark-full-dark.svg"
              alt=""
              aria-hidden
              width={34}
              height={34}
              className="zebra zebra-dark"
            />
          </div>
          <div className="relative min-h-8.5 flex items-center">
            {/* Wordmark lockup — "Nhimbe by Mukoko Events" (visible when not scrolled) */}
            <span
              className={`flex flex-col leading-none transition-all duration-300 ${
                isScrolled && pageTitle
                  ? "opacity-0 absolute"
                  : "opacity-100"
              }`}
            >
              <span className="text-[24px] font-bold text-primary">Nhimbe</span>
              <span className="mt-0.5 text-[10px] font-medium uppercase tracking-wide text-text-tertiary">
                by Mukoko Events
              </span>
            </span>
            {/* Page title - visible when scrolled. Smaller on mobile — at
                full text-lg it overwhelmed the header next to the logo,
                nav pills and action group on narrow viewports. */}
            {pageTitle && (
              <span
                className={`text-sm sm:text-lg font-semibold text-foreground truncate max-w-32 sm:max-w-75 transition-all duration-300 ${
                  isScrolled
                    ? "opacity-100"
                    : "opacity-0 absolute"
                }`}
              >
                {pageTitle}
              </span>
            )}
          </div>
        </Link>

        {/* Nav Links */}
        <nav aria-label="Main navigation" className="hidden md:flex items-center gap-8">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              aria-current={pathname === link.href ? "page" : undefined}
              className={`text-sm font-medium transition-colors ${
                pathname === link.href
                  ? "text-primary"
                  : "text-text-secondary hover:text-foreground"
              }`}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        {/* Actions - pill-shaped icon group with 44px touch targets */}
        <div className="flex items-center bg-primary rounded-full p-1 gap-1 shrink-0">
          <Link
            href="/events/create"
            className="flex items-center justify-center w-11 h-11 rounded-full bg-background/10 hover:bg-background/20 transition-colors"
            aria-label="Create event"
          >
            <Plus className="w-6 h-6 text-primary-foreground" />
          </Link>
          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            className="flex items-center justify-center w-11 h-11 rounded-full bg-background/10 hover:bg-background/20 transition-colors"
            aria-label="Search events (⌘K)"
          >
            <Search className="w-6 h-6 text-primary-foreground" />
          </button>

          {/* Profile / Sign In button */}
          {isLoading ? (
            <div className="flex items-center justify-center w-11 h-11 rounded-full bg-background/20">
              <div className="w-5 h-5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
            </div>
          ) : isAuthenticated ? (
            <NyuchiUserMenu
              compact
              name={userName || "User"}
              email={user?.email}
              avatarUrl={user?.image}
              menuItems={userMenuItems}
              onSignOut={handleSignOut}
              className="w-11 h-11 justify-center bg-background/20 p-0 hover:bg-background/30"
            />
          ) : (
            <Link
              href={`/auth/hosted?return_to=${encodeURIComponent(pathname)}`}
              className="flex items-center justify-center w-11 h-11 rounded-full bg-background/20 hover:bg-background/30 transition-colors"
              aria-label="Sign in"
            >
              <LogIn className="w-5 h-5 text-primary-foreground" />
            </Link>
          )}
        </div>
      </div>

      <NyuchiCommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        navItems={PALETTE_NAV}
        onSearch={searchPalette}
        recentQueries={recentQueries}
        onSelect={(item) => router.push(item.href)}
        onSubmitQuery={commitQuery}
      />
    </header>
  );
}
