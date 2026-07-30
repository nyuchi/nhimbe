"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, CalendarDays, Compass, Ticket, User } from "lucide-react";
import { useAuth } from "@/components/auth/auth-context";

// Discover replaces Map in the bottom bar (NYU-24 IA) — the map stays one
// tap away via /discover's "Near me" entry.
const mobileNavItems = [
  { href: "/", label: "Home", icon: Home },
  { href: "/discover", label: "Discover", icon: Compass },
  { href: "/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/my-events", label: "My Events", icon: Ticket },
  { href: "/profile", label: "Profile", icon: User },
];

export function MobileBottomNav() {
  const pathname = usePathname();
  const { isAuthenticated } = useAuth();

  // Hide on pages that have their own fixed bottom bars or are full-screen
  // (/admin no longer renders here — it redirects to the standalone admin app.)
  const hiddenPaths = ["/events/create", "/signage", "/kiosk"];
  const shouldHide = hiddenPaths.some((p) => pathname.startsWith(p))
    || pathname.includes("/manage");

  if (shouldHide) return null;

  return (
    <nav
      aria-label="Mobile navigation"
      className="fixed inset-x-4 z-40 md:hidden"
      style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 1rem)" }}
    >
      <div className="flex items-center justify-around px-2 h-14 mx-auto max-w-100 rounded-full bg-background/90 backdrop-blur-xl border border-elevated shadow-lg">
        {mobileNavItems.map((item) => {
          // For profile, redirect to sign-in if not authenticated
          const href =
            item.href === "/profile" && !isAuthenticated
              ? `/auth/hosted?return_to=${encodeURIComponent(pathname)}`
              : item.href;

          const isActive =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href);

          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={href}
              className={`flex flex-col items-center justify-center gap-0.5 w-14 h-12 rounded-full transition-colors ${
                isActive
                  ? "text-primary"
                  : "text-text-tertiary hover:text-foreground"
              }`}
              aria-current={isActive ? "page" : undefined}
            >
              <Icon className="w-5 h-5" />
              <span className="text-[10px] font-medium leading-none">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
