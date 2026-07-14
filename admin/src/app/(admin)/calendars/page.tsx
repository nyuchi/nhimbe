/**
 * /calendars — server component. requireAdmin() + first page of
 * events.calendars straight from Mongo.
 */

import { headers } from "next/headers";
import CalendarsClient from "./calendars-client";
import { listAdminCalendars, type AdminCalendarsResult } from "@/lib/mongo/admin";
import { requireAdmin } from "@admin/lib/require-admin";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;

export default async function AdminCalendarsPage() {
  await requireAdmin();
  void (await headers());

  let data: AdminCalendarsResult;
  try {
    data = await listAdminCalendars({ limit: PAGE_SIZE, offset: 0 });
  } catch (err) {
    console.error("[mukoko] admin/calendars: mongo read failed", err);
    data = { calendars: [], total: 0 };
  }

  return (
    <CalendarsClient
      initialCalendars={data.calendars}
      initialTotal={data.total}
      pageSize={PAGE_SIZE}
    />
  );
}
