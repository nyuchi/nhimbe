/**
 * /admin dashboard — server component.
 *
 * The previous "use client" page leaked the entire admin bundle to anonymous
 * visitors and ran the role check on the client AFTER the initial fetch had
 * already fired. This shell does the work server-side: AuthKit's withAuth()
 * gates the response, requireAdmin() resolves identity.person.role and
 * bounces non-admins to "/", and the dashboard payload is read straight from
 * MongoDB before any client JS runs. The interactive bits live in
 * admin-dashboard-client.tsx.
 */

import { headers } from "next/headers";
import AdminDashboardClient, {
  type DashboardStats,
} from "./admin-dashboard-client";
import { getAdminStats, type AdminDashboardData } from "@/lib/mongo/admin";
import { requireAdmin } from "./require-admin";

// Always render fresh — the dashboard shows live metrics and the user
// list, and we don't want a per-deployment static snapshot.
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

export default async function AdminDashboardPage() {
  await requireAdmin();
  // Touch headers() so Next treats this page as dynamic even if the rest of
  // the request never references request-scoped state — keeps the
  // server-only role gate from being cached on the edge.
  void (await headers());

  let data: AdminDashboardData;
  try {
    data = await getAdminStats();
  } catch (err) {
    console.error("[mukoko] /admin dashboard: mongo read failed", err);
    data = { stats: EMPTY_STATS, recentEvents: [], recentUsers: [], tickets: [] };
  }

  return (
    <AdminDashboardClient
      stats={data.stats}
      recentEvents={data.recentEvents}
      recentUsers={data.recentUsers}
      tickets={data.tickets}
    />
  );
}
