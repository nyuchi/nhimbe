"use client";

/**
 * Events table — search, status filter, pagination, and the moderation
 * actions: publish / cancel / archive lifecycle transitions plus the
 * feature toggle. All mutations run through admin-gated server actions.
 */

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Search,
  Loader2,
  ChevronLeft,
  ChevronRight,
  MoreVertical,
  Eye,
  Calendar,
  MapPin,
  Users,
  AlertTriangle,
  Star,
  StarOff,
  Upload,
  Ban,
  Archive,
} from "lucide-react";
import type { AdminEvent } from "@/lib/mongo/admin-types";
import {
  fetchAdminEvents,
  publishEvent,
  cancelEvent,
  archiveEvent,
  setEventFeatured,
} from "@admin/app/actions/admin";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://nhimbe.com";

type LifecycleAction = "publish" | "cancel" | "archive";

const CONFIRM_COPY: Record<
  LifecycleAction,
  { title: string; body: (name: string) => string; cta: string; destructive: boolean }
> = {
  publish: {
    title: "Publish event?",
    body: (name) => `"${name}" will become publicly visible and open for RSVPs.`,
    cta: "Publish",
    destructive: false,
  },
  cancel: {
    title: "Cancel event?",
    body: (name) =>
      `"${name}" will be marked cancelled. Attendees keep their RSVP history — events are never hard-deleted.`,
    cta: "Cancel event",
    destructive: true,
  },
  archive: {
    title: "Archive event?",
    body: (name) => `"${name}" will be removed from all public surfaces without being cancelled.`,
    cta: "Archive",
    destructive: true,
  },
};

export interface EventsClientProps {
  initialEvents: AdminEvent[];
  initialTotal: number;
  initialStatus?: string;
  pageSize?: number;
}

export default function EventsClient({
  initialEvents,
  initialTotal,
  initialStatus,
  pageSize = 20,
}: EventsClientProps) {
  const limit = pageSize;
  const [events, setEvents] = useState<AdminEvent[]>(initialEvents);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>(initialStatus || "all");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(Math.max(1, Math.ceil(initialTotal / limit)));
  const [loading, setLoading] = useState(false);
  const [actionMenuOpen, setActionMenuOpen] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<{
    event: AdminEvent;
    action: LifecycleAction;
  } | null>(null);

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchAdminEvents({
        limit,
        offset: (page - 1) * limit,
        search: search || undefined,
        status: statusFilter !== "all" ? statusFilter : undefined,
      });
      setEvents(data.events);
      setTotalPages(Math.max(1, Math.ceil(data.total / limit)));
    } catch (error) {
      console.error("[mukoko] admin/events: fetch failed", error);
    } finally {
      setLoading(false);
    }
  }, [limit, page, search, statusFilter]);

  // Initial render uses props; only re-fetch on user-driven changes.
  const [hasMounted, setHasMounted] = useState(false);
  useEffect(() => {
    if (!hasMounted) {
      setHasMounted(true);
      return;
    }
    fetchEvents();
  }, [fetchEvents, hasMounted]);

  async function runLifecycleAction(eventId: string, action: LifecycleAction) {
    try {
      if (action === "publish") await publishEvent(eventId);
      else if (action === "cancel") await cancelEvent(eventId);
      else await archiveEvent(eventId);
      fetchEvents();
    } catch (error) {
      console.error(`[mukoko] admin/events: ${action} failed`, error);
    }
    setPendingAction(null);
    setActionMenuOpen(null);
  }

  async function toggleFeatured(event: AdminEvent) {
    try {
      await setEventFeatured(event.id, !event.featured);
      fetchEvents();
    } catch (error) {
      console.error("[mukoko] admin/events: feature toggle failed", error);
    }
    setActionMenuOpen(null);
  }

  function getStatusVariant(status: string): "default" | "warning" | "secondary" | "error" {
    switch (status) {
      case "upcoming":
        return "default";
      case "ongoing":
        return "warning";
      case "cancelled":
        return "error";
      case "past":
      default:
        return "secondary";
    }
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Events</h1>
          <p className="text-muted-foreground">Manage all events on the platform</p>
        </div>
      </div>

      {/* Search and Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search events..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                className="pl-10"
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              className="px-4 py-2 bg-card border border-border rounded-full text-foreground min-h-9"
              aria-label="Filter by status"
            >
              <option value="all">All Status</option>
              <option value="upcoming">Upcoming</option>
              <option value="ongoing">Ongoing</option>
              <option value="past">Past</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
        </CardContent>
      </Card>

      {/* Events Table */}
      <Card>
        <CardHeader>
          <CardTitle>All Events</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : events.length === 0 ? (
            <p className="text-muted-foreground text-center py-12">No events found</p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="text-left text-sm text-muted-foreground border-b border-border">
                      <th className="pb-3 font-medium">Event</th>
                      <th className="pb-3 font-medium hidden md:table-cell">Date & Location</th>
                      <th className="pb-3 font-medium hidden lg:table-cell">Host</th>
                      <th className="pb-3 font-medium">RSVPs</th>
                      <th className="pb-3 font-medium">Status</th>
                      <th className="pb-3 font-medium w-10"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {events.map((event) => (
                      <tr key={event.id} className="hover:bg-muted/50">
                        <td className="py-3 pr-4">
                          <div className="min-w-0">
                            <div className="font-medium truncate max-w-[200px] flex items-center gap-1.5">
                              {event.featured && (
                                <Star
                                  className="w-3.5 h-3.5 shrink-0 text-gold fill-current"
                                  aria-label="Featured"
                                />
                              )}
                              <span className="truncate">{event.name}</span>
                            </div>
                            <div className="text-sm text-muted-foreground">{event.category}</div>
                          </div>
                        </td>
                        <td className="py-3 pr-4 hidden md:table-cell">
                          <div className="space-y-1">
                            <div className="flex items-center gap-1 text-foreground/80 text-sm">
                              <Calendar className="w-3 h-3" />
                              <span>{event.date.full}</span>
                            </div>
                            <div className="flex items-center gap-1 text-muted-foreground text-sm">
                              <MapPin className="w-3 h-3" />
                              <span>
                                {event.location.name}, {event.location.addressLocality}
                              </span>
                            </div>
                          </div>
                        </td>
                        <td className="py-3 pr-4 hidden lg:table-cell text-sm text-foreground/80">
                          {event.organizer.name}
                        </td>
                        <td className="py-3 pr-4">
                          <div className="flex items-center gap-1 text-foreground/80">
                            <Users className="w-4 h-4" />
                            <span>
                              {event.attendeeCount}
                              {event.maximumAttendeeCapacity &&
                                `/${event.maximumAttendeeCapacity}`}
                            </span>
                          </div>
                        </td>
                        <td className="py-3 pr-4">
                          <div className="flex flex-col items-start gap-1">
                            <Badge variant={getStatusVariant(event.status)}>{event.status}</Badge>
                            {(event.lifecycleStatus === "draft" ||
                              event.lifecycleStatus === "archived") && (
                              <Badge variant="secondary">{event.lifecycleStatus}</Badge>
                            )}
                          </div>
                        </td>
                        <td className="py-3 relative">
                          <Button
                            variant="ghost"
                            size="sm"
                            aria-label={`Actions for ${event.name}`}
                            onClick={() =>
                              setActionMenuOpen(actionMenuOpen === event.id ? null : event.id)
                            }
                            className="p-2 hover:bg-muted rounded-lg h-auto min-h-0"
                          >
                            <MoreVertical className="w-4 h-4" />
                          </Button>
                          {actionMenuOpen === event.id && (
                            <>
                              <div
                                className="fixed inset-0 z-10"
                                onClick={() => setActionMenuOpen(null)}
                              />
                              <div className="absolute right-0 top-full mt-1 z-20 bg-popover border border-border rounded-lg shadow-lg py-1 min-w-[180px]">
                                <a
                                  href={`${SITE_URL}/events/${event.id}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="flex items-center gap-2 px-4 py-2 text-sm hover:bg-muted"
                                >
                                  <Eye className="w-4 h-4" />
                                  View on nhimbe
                                </a>
                                <Button
                                  variant="ghost"
                                  onClick={() => toggleFeatured(event)}
                                  className="w-full flex items-center gap-2 px-4 py-2 text-sm hover:bg-muted rounded-none justify-start h-auto"
                                >
                                  {event.featured ? (
                                    <StarOff className="w-4 h-4" />
                                  ) : (
                                    <Star className="w-4 h-4" />
                                  )}
                                  {event.featured ? "Unfeature" : "Feature"}
                                </Button>
                                {event.lifecycleStatus !== "published" &&
                                  event.lifecycleStatus !== "live" && (
                                    <Button
                                      variant="ghost"
                                      onClick={() => {
                                        setPendingAction({ event, action: "publish" });
                                        setActionMenuOpen(null);
                                      }}
                                      className="w-full flex items-center gap-2 px-4 py-2 text-sm text-success hover:bg-muted rounded-none justify-start h-auto"
                                    >
                                      <Upload className="w-4 h-4" />
                                      Publish
                                    </Button>
                                  )}
                                {event.lifecycleStatus !== "cancelled" && (
                                  <Button
                                    variant="ghost"
                                    onClick={() => {
                                      setPendingAction({ event, action: "cancel" });
                                      setActionMenuOpen(null);
                                    }}
                                    className="w-full flex items-center gap-2 px-4 py-2 text-sm text-error hover:bg-muted rounded-none justify-start h-auto"
                                  >
                                    <Ban className="w-4 h-4" />
                                    Cancel event
                                  </Button>
                                )}
                                {event.lifecycleStatus !== "archived" && (
                                  <Button
                                    variant="ghost"
                                    onClick={() => {
                                      setPendingAction({ event, action: "archive" });
                                      setActionMenuOpen(null);
                                    }}
                                    className="w-full flex items-center gap-2 px-4 py-2 text-sm hover:bg-muted rounded-none justify-start h-auto"
                                  >
                                    <Archive className="w-4 h-4" />
                                    Archive
                                  </Button>
                                )}
                              </div>
                            </>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-6 pt-4 border-t border-border">
                  <div className="text-sm text-muted-foreground">
                    Page {page} of {totalPages}
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="secondary"
                      size="default"
                      disabled={page === 1}
                      aria-label="Previous page"
                      onClick={() => setPage(page - 1)}
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </Button>
                    {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                      const start = Math.max(1, Math.min(page - 2, totalPages - 4));
                      const p = start + i;
                      if (p > totalPages) return null;
                      return (
                        <Button
                          key={p}
                          variant={p === page ? "default" : "ghost"}
                          size="default"
                          onClick={() => setPage(p)}
                          className="w-10"
                        >
                          {p}
                        </Button>
                      );
                    })}
                    <Button
                      variant="secondary"
                      size="default"
                      disabled={page === totalPages}
                      aria-label="Next page"
                      onClick={() => setPage(page + 1)}
                    >
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Lifecycle confirmation modal */}
      {pendingAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setPendingAction(null)} />
          <div className="relative bg-card border border-border rounded-2xl p-6 max-w-md w-full mx-4">
            <div className="flex items-center gap-4 mb-4">
              <div
                className={`w-12 h-12 rounded-full flex items-center justify-center ${
                  CONFIRM_COPY[pendingAction.action].destructive ? "bg-error/15" : "bg-success/15"
                }`}
              >
                <AlertTriangle
                  className={`w-6 h-6 ${
                    CONFIRM_COPY[pendingAction.action].destructive ? "text-error" : "text-success"
                  }`}
                />
              </div>
              <h2 className="text-lg font-bold">{CONFIRM_COPY[pendingAction.action].title}</h2>
            </div>
            <p className="text-muted-foreground mb-6">
              {CONFIRM_COPY[pendingAction.action].body(pendingAction.event.name)}
            </p>
            <div className="flex gap-3">
              <Button variant="secondary" className="flex-1" onClick={() => setPendingAction(null)}>
                Keep as is
              </Button>
              <Button
                variant="default"
                className={`flex-1 ${
                  CONFIRM_COPY[pendingAction.action].destructive
                    ? "bg-error hover:bg-error/90 text-white"
                    : ""
                }`}
                onClick={() => runLifecycleAction(pendingAction.event.id, pendingAction.action)}
              >
                {CONFIRM_COPY[pendingAction.action].cta}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
