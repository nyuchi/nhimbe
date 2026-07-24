"use client";

/**
 * Overview — the admin dashboard's client half (ported from the in-app
 * admin-dashboard-client). Pure presentation: all data arrives from the
 * server page, all links point at the standalone app's own routes.
 */

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { NyuchiStatsRow, type StatItem } from "@/components/ui/nyuchi-stats-row";
import { NyuchiHeroStat } from "@/components/ui/nyuchi-hero-stat";
import type {
  DashboardStats,
  RecentEvent,
  RecentUser,
  SupportTicket,
} from "@/lib/mongo/admin-types";
import {
  Users,
  Calendar,
  CalendarRange,
  TrendingUp,
  Building2,
  CircleDot,
  AlertCircle,
  CheckCircle,
  Clock,
} from "lucide-react";
import Link from "next/link";

export interface OverviewClientProps {
  stats: DashboardStats;
  recentEvents: RecentEvent[];
  recentUsers: RecentUser[];
  tickets: SupportTicket[];
}

export default function OverviewClient({
  stats,
  recentEvents,
  recentUsers,
  tickets,
}: OverviewClientProps) {
  // Format a growth number into a signed trend string (e.g. "+12%").
  const trend = (n: number | null) =>
    n == null || n === 0 ? undefined : `${n > 0 ? "+" : ""}${n}%`;

  // Branded stat grid — each block a mineral-tinted, click-through metric.
  const primaryStats: StatItem[] = [
    {
      icon: Users,
      label: "Total Users",
      value: stats.totalUsers.toLocaleString(),
      trend: trend(stats.userGrowth),
      color: "var(--color-tanzanite)",
      href: "/people",
    },
    {
      icon: Calendar,
      label: "Total Events",
      value: stats.totalEvents.toLocaleString(),
      trend: trend(stats.eventGrowth),
      color: "var(--color-cobalt)",
      href: "/events",
    },
    {
      icon: TrendingUp,
      label: "Active Events",
      value: stats.activeEvents.toLocaleString(),
      color: "var(--color-malachite)",
      href: "/events?status=upcoming",
    },
    {
      icon: Users,
      label: "Total RSVPs",
      value: stats.totalRegistrations.toLocaleString(),
      color: "var(--color-gold)",
    },
  ];

  const ecosystemStats: StatItem[] = [
    {
      icon: Building2,
      label: "Host Entities",
      value: stats.totalEntities.toLocaleString(),
      color: "var(--color-terracotta)",
      href: "/entities",
    },
    {
      icon: CircleDot,
      label: "Circles",
      value: stats.totalCircles.toLocaleString(),
      color: "var(--color-sodalite)",
      href: "/circles",
    },
    {
      icon: CalendarRange,
      label: "Calendars",
      value: stats.totalCalendars.toLocaleString(),
      color: "var(--color-tanzanite)",
      href: "/calendars",
    },
  ];

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold">Overview</h1>
        <p className="text-muted-foreground">Welcome to the Mukoko Events Admin dashboard</p>
      </div>

      {/* Flagship engagement metric — the branded hero stat. */}
      <NyuchiHeroStat
        title="Total RSVPs"
        value={stats.totalRegistrations.toLocaleString()}
        subtitle="Across all events"
        secondaryStats={[
          { label: "Active events", value: stats.activeEvents.toLocaleString() },
          { label: "Events", value: stats.totalEvents.toLocaleString() },
        ]}
        icon={<TrendingUp className="h-8 w-8" />}
      />

      {/* Stats grids — branded NyuchiStatsRow (mineral-tinted, click-through). */}
      <NyuchiStatsRow layout="grid" columns={4} stats={primaryStats} />
      <NyuchiStatsRow layout="grid" columns={3} stats={ecosystemStats} />

      {/* Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Events */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Recent Events</CardTitle>
            <Link href="/events" className="text-sm text-primary hover:underline">
              View all
            </Link>
          </CardHeader>
          <CardContent>
            {recentEvents.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">No events found</p>
            ) : (
              <div className="space-y-4">
                {recentEvents.map((event) => (
                  <div
                    key={event.id}
                    className="flex items-center justify-between p-3 rounded-lg bg-muted/60"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{event.title}</div>
                      <div className="text-sm text-muted-foreground">{event.date}</div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm text-muted-foreground">
                        {event.attendeeCount} RSVPs
                      </span>
                      <Badge
                        variant={
                          event.status === "upcoming"
                            ? "default"
                            : event.status === "ongoing"
                              ? "warning"
                              : "secondary"
                        }
                      >
                        {event.status}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Users */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Recent Users</CardTitle>
            <Link href="/people" className="text-sm text-primary hover:underline">
              View all
            </Link>
          </CardHeader>
          <CardContent>
            {recentUsers.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">No users found</p>
            ) : (
              <div className="space-y-4">
                {recentUsers.map((user) => (
                  <div
                    key={user.id}
                    className="flex items-center gap-3 p-3 rounded-lg bg-muted/60"
                  >
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-secondary to-primary flex items-center justify-center text-sm font-bold text-background">
                      {user.name.charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{user.name}</div>
                      <div className="text-sm text-muted-foreground truncate">{user.email}</div>
                    </div>
                    <div className="text-xs text-muted-foreground">{user.createdAt}</div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Support Tickets */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Support Tickets</CardTitle>
          <Link href="/support" className="text-sm text-primary hover:underline">
            View all
          </Link>
        </CardHeader>
        <CardContent>
          {tickets.length === 0 ? (
            <div className="text-center py-8">
              <CheckCircle className="w-10 h-10 text-success mx-auto mb-2" />
              <p className="text-muted-foreground">All tickets resolved</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="text-left text-sm text-muted-foreground border-b border-border">
                    <th className="pb-3 font-medium">Subject</th>
                    <th className="pb-3 font-medium">Status</th>
                    <th className="pb-3 font-medium">Created</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {tickets.map((ticket) => (
                    <tr key={ticket.id} className="hover:bg-muted/50">
                      <td className="py-3 pr-4">
                        <span className="font-medium">{ticket.subject}</span>
                      </td>
                      <td className="py-3 pr-4">
                        <Badge
                          variant={
                            ticket.status === "open"
                              ? "error"
                              : ticket.status === "pending"
                                ? "warning"
                                : "success"
                          }
                        >
                          {ticket.status === "open" && <AlertCircle className="w-3 h-3" />}
                          {ticket.status === "pending" && <Clock className="w-3 h-3" />}
                          {ticket.status === "resolved" && <CheckCircle className="w-3 h-3" />}
                          {ticket.status}
                        </Badge>
                      </td>
                      <td className="py-3 text-muted-foreground text-sm">{ticket.createdAt}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
