/**
 * /admin dashboard — server component.
 *
 * The previous "use client" page leaked the entire admin bundle to anonymous
 * visitors and ran the role check on the client AFTER the initial fetch had
 * already fired. This shell does the work server-side: AuthKit's withAuth()
 * gates the response, requireAdmin() resolves identity.person.role and
 * bounces non-admins to "/", and the initial dashboard payload is loaded
 * before any client JS runs. The interactive bits live in admin-dashboard-client.tsx.
 */

import { headers } from "next/headers";
import AdminDashboardClient, {
  type DashboardStats,
  type RecentEvent,
  type RecentUser,
  type SupportTicket,
} from "./admin-dashboard-client";
import { requireAdmin } from "./require-admin";

// Always render fresh — the dashboard shows live metrics and the user
// list, and we don't want a per-deployment static snapshot.
export const dynamic = "force-dynamic";

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ||
  "https://mukoko-nhimbe-api.nyuchi.workers.dev";

const EMPTY_STATS: DashboardStats = {
  totalUsers: 0,
  totalEvents: 0,
  totalRegistrations: 0,
  activeEvents: 0,
  userGrowth: 0,
  eventGrowth: 0,
  recentViews: 0,
  viewsGrowth: 0,
};

type StatsResponse = {
  stats?: DashboardStats;
  recentEvents?: RecentEvent[];
  recentUsers?: RecentUser[];
  tickets?: SupportTicket[];
};

async function fetchDashboard(accessToken: string): Promise<StatsResponse> {
  try {
    const res = await fetch(`${API_URL}/api/admin/stats`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });
    if (!res.ok) {
      console.error(
        `[mukoko] /admin dashboard: worker /api/admin/stats returned ${res.status}`,
      );
      return {};
    }
    return (await res.json()) as StatsResponse;
  } catch (err) {
    console.error("[mukoko] /admin dashboard: worker fetch failed", err);
    return {};
  }
}

export default async function AdminDashboardPage() {
  const { accessToken } = await requireAdmin();
  // Touch headers() so Next treats this page as dynamic even if the rest of
  // the request never references request-scoped state — keeps the
  // server-only role gate from being cached on the edge.
  void (await headers());

  const data = await fetchDashboard(accessToken);

  return (
    <AdminDashboardClient
      stats={data.stats ?? EMPTY_STATS}
      recentEvents={data.recentEvents ?? []}
      recentUsers={data.recentUsers ?? []}
      tickets={data.tickets ?? []}
    />
  );
}
