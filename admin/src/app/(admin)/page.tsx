/**
 * Overview (/) — server component.
 *
 * requireAdmin() gates the response server-side before any admin bundle
 * ships; the dashboard payload is read straight from MongoDB via the shared
 * admin query layer. Degrades to empty tiles when the cluster is
 * unreachable — the shell must never 500 on a Mongo blip.
 */

import { headers } from "next/headers";
import OverviewClient from "./overview-client";
import { getAdminStats, type AdminDashboardData } from "@/lib/mongo/admin";
import type { DashboardStats } from "@/lib/mongo/admin-types";
import { requireAdmin } from "@admin/lib/require-admin";

// Always render fresh — the dashboard shows live metrics.
export const dynamic = "force-dynamic";

const EMPTY_STATS: DashboardStats = {
  totalUsers: 0,
  totalEvents: 0,
  totalRegistrations: 0,
  activeEvents: 0,
  totalEntities: 0,
  totalCircles: 0,
  totalCalendars: 0,
  userGrowth: 0,
  eventGrowth: 0,
  recentViews: 0,
  viewsGrowth: 0,
};

export default async function OverviewPage() {
  await requireAdmin();
  // Touch headers() so Next treats this page as dynamic even if the rest of
  // the request never references request-scoped state.
  void (await headers());

  let data: AdminDashboardData;
  try {
    data = await getAdminStats();
  } catch (err) {
    console.error("[mukoko] admin overview: mongo read failed", err);
    data = { stats: EMPTY_STATS, recentEvents: [], recentUsers: [], tickets: [] };
  }

  return (
    <OverviewClient
      stats={data.stats}
      recentEvents={data.recentEvents}
      recentUsers={data.recentUsers}
      tickets={data.tickets}
    />
  );
}
