/**
 * /admin/events — server component.
 *
 * AuthKit + identity.person.role gate runs server-side so the admin events
 * bundle never ships to anonymous or non-admin visitors. The first page of
 * events is fetched server-side; the client takes over for filter / search /
 * pagination / delete.
 */

import { headers } from "next/headers";
import AdminEventsClient, { type AdminEvent } from "./admin-events-client";
import { requireAdmin } from "../require-admin";

export const dynamic = "force-dynamic";

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ||
  "https://mukoko-nhimbe-api.nyuchi.workers.dev";

const PAGE_SIZE = 20;

type EventsResponse = {
  events?: AdminEvent[];
  total?: number;
};

async function fetchInitialEvents(accessToken: string): Promise<EventsResponse> {
  const params = new URLSearchParams({
    limit: PAGE_SIZE.toString(),
    offset: "0",
  });
  try {
    const res = await fetch(`${API_URL}/api/admin/events?${params}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });
    if (!res.ok) {
      console.error(
        `[mukoko] /admin/events: worker /api/admin/events returned ${res.status}`,
      );
      return {};
    }
    return (await res.json()) as EventsResponse;
  } catch (err) {
    console.error("[mukoko] /admin/events: worker fetch failed", err);
    return {};
  }
}

export default async function AdminEventsPage() {
  const { accessToken } = await requireAdmin();
  void (await headers());

  const data = await fetchInitialEvents(accessToken);

  return (
    <AdminEventsClient
      initialEvents={data.events ?? []}
      initialTotal={data.total ?? 0}
      accessToken={accessToken}
      pageSize={PAGE_SIZE}
    />
  );
}
