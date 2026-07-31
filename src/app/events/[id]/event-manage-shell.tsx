"use client";

import Link from "next/link";
import {
  ArrowLeft,
  BarChart3,
  ExternalLink,
  LayoutDashboard,
  MessageSquare,
  Pencil,
  Settings,
  Ticket,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { NyuchiSidebarNav, type NavItem } from "@/components/ui/nyuchi-sidebar-nav";
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarProvider,
  SidebarSeparator,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

export type ManageSectionKey =
  | "overview"
  | "guests"
  | "registration"
  | "blasts"
  | "insights"
  | "settings"
  | "edit";

interface EventManageShellProps {
  eventId: string;
  eventName: string;
  activeKey: ManageSectionKey;
  /** Pending-approval count, surfaced as a badge on the Guests nav item. */
  pendingGuestCount?: number;
  children: React.ReactNode;
}

/**
 * The dashboard-with-sidebar shell shared by the event manage and edit
 * pages — the shadcn `sidebar` primitive hosting the Mzizi `NyuchiSidebarNav`,
 * the same composition `mukoko-events-admin`'s `AdminShell` uses. Manage
 * sections are real routes (`?section=`), not local tab state, so the sidebar
 * highlights correctly and stays a real nav regardless of which of these two
 * routes rendered it.
 */
export function EventManageShell({
  eventId,
  eventName,
  activeKey,
  pendingGuestCount = 0,
  children,
}: EventManageShellProps) {
  const items: NavItem[] = [
    {
      key: "overview",
      label: "Overview",
      icon: <LayoutDashboard className="h-4.5 w-4.5" />,
      href: `/events/${eventId}/manage`,
    },
    {
      key: "guests",
      label: "Guests",
      icon: <Users className="h-4.5 w-4.5" />,
      href: `/events/${eventId}/manage?section=guests`,
      badge: pendingGuestCount,
    },
    {
      key: "registration",
      label: "Registration",
      icon: <Ticket className="h-4.5 w-4.5" />,
      href: `/events/${eventId}/manage?section=registration`,
    },
    {
      key: "blasts",
      label: "Blasts",
      icon: <MessageSquare className="h-4.5 w-4.5" />,
      href: `/events/${eventId}/manage?section=blasts`,
    },
    {
      key: "insights",
      label: "Insights",
      icon: <BarChart3 className="h-4.5 w-4.5" />,
      href: `/events/${eventId}/manage?section=insights`,
    },
    {
      key: "settings",
      label: "Settings",
      icon: <Settings className="h-4.5 w-4.5" />,
      href: `/events/${eventId}/manage?section=settings`,
    },
    {
      key: "edit",
      label: "Edit event",
      icon: <Pencil className="h-4.5 w-4.5" />,
      href: `/events/${eventId}/edit`,
    },
  ];

  return (
    <SidebarProvider>
      <Sidebar collapsible="offcanvas">
        <SidebarHeader>
          <Link
            href="/my-events"
            className="flex items-center gap-2 px-2 py-1.5 text-sm font-medium text-foreground/70 transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            My events
          </Link>
        </SidebarHeader>
        <SidebarSeparator />
        <SidebarContent>
          <NyuchiSidebarNav width="w-full" activeKey={activeKey} items={items} />
        </SidebarContent>
      </Sidebar>
      {/* Deliberately a <div>, not the `sidebar` primitive's <SidebarInset>
          (which renders <main>): the root layout already wraps every route in
          <main id="main-content"> for the skip-link, so a second <main> here
          would nest two non-hidden main landmarks in one document — invalid
          per the HTML spec and ambiguous for screen-reader landmark nav. Same
          className as SidebarInset, so the sidebar's CSS (peer-data
          selectors, all attribute-based, not tag-based) behaves identically. */}
      <div
        data-slot="sidebar-inset"
        className={cn(
          "relative flex w-full flex-1 flex-col bg-background md:peer-data-[variant=inset]:m-2 md:peer-data-[variant=inset]:ml-0 md:peer-data-[variant=inset]:rounded-[var(--radius-xl,17px)] md:peer-data-[variant=inset]:shadow-sm md:peer-data-[variant=inset]:peer-data-[state=collapsed]:ml-2",
        )}
      >
        <div className="flex items-center gap-3 border-b px-4 py-3 sm:px-6" style={{ borderColor: "var(--border)" }}>
          <SidebarTrigger />
          <h1 className="min-w-0 flex-1 truncate text-foreground text-[15px] font-semibold">{eventName}</h1>
          <Button asChild variant="secondary" size="sm" className="gap-2 shrink-0">
            <Link href={`/events/${eventId}`}>
              <ExternalLink className="h-4 w-4" />
              <span className="hidden sm:inline">View event</span>
            </Link>
          </Button>
        </div>
        <div className="flex-1 overflow-x-hidden">{children}</div>
      </div>
    </SidebarProvider>
  );
}
