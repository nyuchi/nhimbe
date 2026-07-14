"use client";

/**
 * AdminShell — the client chrome around every gated admin page: branded
 * NyuchiSidebarNav, mobile drawer, top bar, and the signed-in account block.
 *
 * Unlike the old in-app admin layout this component does NO access control —
 * the server layout has already run requireAdmin("admin") before this ships,
 * and each page re-gates at its own level. The role prop only drives the
 * locked-item affordances in the nav (admins see Settings locked until they
 * hold super_admin).
 */

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Calendar,
  CalendarRange,
  Users,
  Building2,
  CircleDot,
  MessageSquare,
  Settings,
  MonitorPlay,
  LogOut,
  Menu,
  X,
  Shield,
  ChevronDown,
  Lock,
} from "lucide-react";
import {
  NyuchiSidebarNav,
  type NavItem as SidebarNavItem,
} from "@/components/ui/nyuchi-sidebar-nav";
import { hasRole, type UserRole } from "@admin/lib/roles";
import { signOutAction } from "@admin/app/actions/auth";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://nhimbe.com";

interface NavEntry {
  label: string;
  href: string;
  icon: React.ElementType;
  requiredRole: UserRole;
  section: string;
}

const NAV_ITEMS: NavEntry[] = [
  { label: "Overview", href: "/", icon: LayoutDashboard, requiredRole: "admin", section: "Platform" },
  { label: "Events", href: "/events", icon: Calendar, requiredRole: "admin", section: "Platform" },
  { label: "People", href: "/people", icon: Users, requiredRole: "admin", section: "Platform" },
  { label: "Entities", href: "/entities", icon: Building2, requiredRole: "admin", section: "Platform" },
  { label: "Circles", href: "/circles", icon: CircleDot, requiredRole: "admin", section: "Platform" },
  { label: "Calendars", href: "/calendars", icon: CalendarRange, requiredRole: "admin", section: "Platform" },
  { label: "Support", href: "/support", icon: MessageSquare, requiredRole: "admin", section: "Operations" },
  { label: "Signage", href: "/signage", icon: MonitorPlay, requiredRole: "admin", section: "Operations" },
  { label: "Settings", href: "/settings", icon: Settings, requiredRole: "super_admin", section: "Operations" },
];

export interface AdminShellProps {
  user: {
    name: string;
    email: string;
    role: UserRole;
  };
  children: React.ReactNode;
}

export function AdminShell({ user, children }: AdminShellProps) {
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  // Show all nav items, marking inaccessible ones as locked (never hidden).
  const visibleNavItems = NAV_ITEMS.map((item) => ({
    ...item,
    accessible: hasRole(user.role, item.requiredRole),
  }));

  // The active nav key — longest matching href so /events wins over /.
  const activeNavKey = NAV_ITEMS.filter(
    (item) => pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href)),
  ).sort((a, b) => b.href.length - a.href.length)[0]?.href;

  const sidebarItems: SidebarNavItem[] = visibleNavItems.map((item) => {
    const Icon = item.icon;
    return {
      key: item.href,
      label: item.label,
      section: item.section,
      icon: <Icon className="h-5 w-5" />,
      href: item.accessible ? item.href : undefined,
      disabled: !item.accessible,
      trailing: !item.accessible ? <Lock className="h-3.5 w-3.5" /> : undefined,
      title: item.accessible ? undefined : `Requires ${item.requiredRole} role`,
    };
  });

  return (
    <div className="min-h-dvh bg-background">
      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed top-0 left-0 z-50 h-full w-64 bg-card border-r border-border transform transition-transform duration-200 md:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="h-16 flex items-center justify-between px-4 border-b border-border">
            <Link href="/" className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
                <Shield className="w-5 h-5 text-primary-foreground" />
              </div>
              <span className="font-bold">nhimbe admin</span>
            </Link>
            <button
              onClick={() => setSidebarOpen(false)}
              aria-label="Close menu"
              className="md:hidden p-2 hover:bg-muted rounded-lg"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Navigation — branded NyuchiSidebarNav; inaccessible items render
              locked (inert with a lock affordance) rather than hidden. */}
          <NyuchiSidebarNav
            width="w-full"
            className="flex-1"
            activeKey={activeNavKey}
            onSelect={() => setSidebarOpen(false)}
            items={sidebarItems}
          />

          {/* User section */}
          <div className="p-4 border-t border-border">
            <div className="relative">
              <button
                onClick={() => setUserMenuOpen(!userMenuOpen)}
                aria-expanded={userMenuOpen}
                className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-muted transition-colors"
              >
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-secondary to-primary flex items-center justify-center text-sm font-bold text-background">
                  {user.name.charAt(0) || "A"}
                </div>
                <div className="flex-1 text-left min-w-0">
                  <div className="text-sm font-medium truncate">{user.name || "Admin"}</div>
                  <div className="text-xs text-muted-foreground truncate">{user.email}</div>
                </div>
                <ChevronDown
                  className={`w-4 h-4 text-muted-foreground transition-transform ${
                    userMenuOpen ? "rotate-180" : ""
                  }`}
                />
              </button>

              {userMenuOpen && (
                <div className="absolute bottom-full left-0 right-0 mb-2 bg-popover rounded-lg shadow-lg border border-border overflow-hidden">
                  <form action={signOutAction}>
                    <button
                      type="submit"
                      className="w-full flex items-center gap-2 px-4 py-3 text-sm text-error hover:bg-muted transition-colors"
                    >
                      <LogOut className="w-4 h-4" />
                      Sign out
                    </button>
                  </form>
                </div>
              )}
            </div>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="md:pl-64">
        {/* Top bar */}
        <header className="sticky top-0 z-30 h-16 bg-background/80 backdrop-blur-sm border-b border-border">
          <div className="h-full px-4 flex items-center gap-4">
            <button
              onClick={() => setSidebarOpen(true)}
              aria-label="Open menu"
              className="md:hidden p-2 hover:bg-muted rounded-lg"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex-1" />
            <a
              href={SITE_URL}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              View site
            </a>
          </div>
        </header>

        {/* Page content */}
        <main className="p-6">{children}</main>
      </div>
    </div>
  );
}
