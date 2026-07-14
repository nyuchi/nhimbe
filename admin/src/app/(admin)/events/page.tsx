/**
 * /events — server component. requireAdmin() gates before any client bundle
 * ships; the first page is read straight from MongoDB and the client takes
 * over for search / filter / pagination / moderation actions.
 */

import { headers } from "next/headers";
import EventsClient from "./events-client";
import { listAdminEvents, type AdminEventsResult } from "@/lib/mongo/admin";
import { requireAdmin } from "@admin/lib/require-admin";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;
const STATUSES = new Set(["upcoming", "ongoing", "past", "cancelled"]);

export default async function AdminEventsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  await requireAdmin();
  void (await headers());

  const { status: rawStatus } = await searchParams;
  const status = rawStatus && STATUSES.has(rawStatus) ? rawStatus : undefined;

  let data: AdminEventsResult;
  try {
    data = await listAdminEvents({ limit: PAGE_SIZE, offset: 0, status });
  } catch (err) {
    console.error("[mukoko] admin/events: mongo read failed", err);
    data = { events: [], total: 0 };
  }

  return (
    <EventsClient
      initialEvents={data.events}
      initialTotal={data.total}
      initialStatus={status}
      pageSize={PAGE_SIZE}
    />
  );
}
