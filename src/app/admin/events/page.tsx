/**
 * /admin/events — server component.
 *
 * AuthKit + identity.person.role gate runs server-side so the admin events
 * bundle never ships to anonymous or non-admin visitors. The first page of
 * events is read directly from MongoDB (events.events); the client takes over
 * for filter / search / pagination / cancel via the admin server actions.
 */

import { headers } from "next/headers";
import AdminEventsClient from "./admin-events-client";
import { listAdminEvents, type AdminEventsResult } from "@/lib/mongo/admin";
import { requireAdmin } from "../require-admin";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;

export default async function AdminEventsPage() {
  await requireAdmin();
  void (await headers());

  let data: AdminEventsResult;
  try {
    data = await listAdminEvents({ limit: PAGE_SIZE, offset: 0 });
  } catch (err) {
    console.error("[mukoko] /admin/events: mongo read failed", err);
    data = { events: [], total: 0 };
  }

  return (
    <AdminEventsClient
      initialEvents={data.events}
      initialTotal={data.total}
      pageSize={PAGE_SIZE}
    />
  );
}
