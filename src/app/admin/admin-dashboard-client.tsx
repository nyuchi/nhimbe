"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { NyuchiStatsRow, type StatItem } from "@/components/ui/nyuchi-stats-row";
import { NyuchiHeroStat } from "@/components/ui/nyuchi-hero-stat";
import {
  Users,
  Calendar,
  TrendingUp,
  Eye,
  AlertCircle,
  CheckCircle,
  Clock,
} from "lucide-react";
import Link from "next/link";

export interface DashboardStats {
  totalUsers: number;
  totalEvents: number;
  totalRegistrations: number;
  activeEvents: number;
  userGrowth: number;
  eventGrowth: number;
  recentViews: number;
  viewsGrowth: number;
}

export interface RecentEvent {
  id: string;
  title: string;
  date: string;
  attendeeCount: number;
  status: "upcoming" | "ongoing" | "past";
}

export interface RecentUser {
  id: string;
  name: string;
  email: string;
  createdAt: string;
}

export interface SupportTicket {
  id: string;
  subject: string;
  status: "open" | "pending" | "resolved";
  createdAt: string;
}

export interface AdminDashboardClientProps {
  stats: DashboardStats;
  recentEvents: RecentEvent[];
  recentUsers: RecentUser[];
  tickets: SupportTicket[];
}

export default function AdminDashboardClient({
  stats,
  recentEvents,
  recentUsers,
  tickets,
}: AdminDashboardClientProps) {
  // Format a growth number into a signed trend string (e.g. "+12%").
  const trend = (n: number | null) =>
    n == null || n === 0 ? undefined : `${n > 0 ? "+" : ""}${n}%`;

  // Branded stat grid — each block a mineral-tinted, click-through metric.
  const statItems: StatItem[] = [
    {
      icon: Users,
      label: "Total Users",
      value: stats.totalUsers.toLocaleString(),
      trend: trend(stats.userGrowth),
      color: "var(--color-tanzanite)",
      href: "/admin/users",
    },
    {
      icon: Calendar,
      label: "Total Events",
      value: stats.totalEvents.toLocaleString(),
      trend: trend(stats.eventGrowth),
      color: "var(--color-cobalt)",
      href: "/admin/events",
    },
    {
      icon: TrendingUp,
      label: "Active Events",
      value: stats.activeEvents.toLocaleString(),
      color: "var(--color-malachite)",
      href: "/admin/events?status=active",
    },
    {
      icon: Eye,
      label: "Page Views (30d)",
      value: stats.recentViews.toLocaleString(),
      trend: trend(stats.viewsGrowth),
      color: "var(--color-gold)",
      href: "/admin/analytics",
    },
  ];

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-text-secondary">
          Welcome to the nhimbe admin dashboard
        </p>
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

      {/* Stats Grid — branded NyuchiStatsRow (mineral-tinted, click-through). */}
      <NyuchiStatsRow layout="grid" columns={4} stats={statItems} />

      {/* Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Events */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Recent Events</CardTitle>
            <Link
              href="/admin/events"
              className="text-sm text-primary hover:underline"
            >
              View all
            </Link>
          </CardHeader>
          <CardContent>
            {recentEvents.length === 0 ? (
              <p className="text-text-tertiary text-center py-8">
                No events found
              </p>
            ) : (
              <div className="space-y-4">
                {recentEvents.map((event) => (
                  <div
                    key={event.id}
                    className="flex items-center justify-between p-3 rounded-lg bg-elevated"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{event.title}</div>
                      <div className="text-sm text-text-tertiary">
                        {event.date}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm text-text-secondary">
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
            <Link
              href="/admin/users"
              className="text-sm text-primary hover:underline"
            >
              View all
            </Link>
          </CardHeader>
          <CardContent>
            {recentUsers.length === 0 ? (
              <p className="text-text-tertiary text-center py-8">
                No users found
              </p>
            ) : (
              <div className="space-y-4">
                {recentUsers.map((user) => (
                  <div
                    key={user.id}
                    className="flex items-center gap-3 p-3 rounded-lg bg-elevated"
                  >
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-secondary to-primary flex items-center justify-center text-sm font-bold text-background">
                      {user.name.charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{user.name}</div>
                      <div className="text-sm text-text-tertiary truncate">
                        {user.email}
                      </div>
                    </div>
                    <div className="text-xs text-text-tertiary">
                      {user.createdAt}
                    </div>
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
          <Link
            href="/admin/support"
            className="text-sm text-primary hover:underline"
          >
            View all
          </Link>
        </CardHeader>
        <CardContent>
          {tickets.length === 0 ? (
            <div className="text-center py-8">
              <CheckCircle className="w-10 h-10 text-green-400 mx-auto mb-2" />
              <p className="text-text-secondary">All tickets resolved</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="text-left text-sm text-text-tertiary border-b border-elevated">
                    <th className="pb-3 font-medium">Subject</th>
                    <th className="pb-3 font-medium">Status</th>
                    <th className="pb-3 font-medium">Created</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-elevated">
                  {tickets.map((ticket) => (
                    <tr key={ticket.id} className="hover:bg-elevated/50">
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
                          {ticket.status === "open" && (
                            <AlertCircle className="w-3 h-3" />
                          )}
                          {ticket.status === "pending" && (
                            <Clock className="w-3 h-3" />
                          )}
                          {ticket.status === "resolved" && (
                            <CheckCircle className="w-3 h-3" />
                          )}
                          {ticket.status}
                        </Badge>
                      </td>
                      <td className="py-3 text-text-tertiary text-sm">
                        {ticket.createdAt}
                      </td>
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
