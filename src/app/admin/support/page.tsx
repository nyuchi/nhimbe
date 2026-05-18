/**
 * /admin/support — server component.
 *
 * AuthKit + identity.person.role gate runs server-side so the admin support
 * bundle never ships to anonymous or non-admin visitors. The first page of
 * tickets is fetched server-side; the client handles status changes,
 * threading, and reply submission.
 */

import { headers } from "next/headers";
import AdminSupportClient, {
  type SupportTicketRow,
} from "./admin-support-client";
import { requireAdmin } from "../require-admin";

export const dynamic = "force-dynamic";

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ||
  "https://mukoko-nhimbe-api.nyuchi.workers.dev";

const PAGE_SIZE = 20;

type TicketsResponse = {
  tickets?: SupportTicketRow[];
  total?: number;
};

async function fetchInitialTickets(
  accessToken: string,
): Promise<TicketsResponse> {
  const params = new URLSearchParams({
    limit: PAGE_SIZE.toString(),
    offset: "0",
  });
  try {
    const res = await fetch(`${API_URL}/api/admin/support?${params}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });
    if (!res.ok) {
      console.error(
        `[mukoko] /admin/support: worker /api/admin/support returned ${res.status}`,
      );
      return {};
    }
    return (await res.json()) as TicketsResponse;
  } catch (err) {
    console.error("[mukoko] /admin/support: worker fetch failed", err);
    return {};
  }
}

export default async function AdminSupportPage() {
  const { accessToken } = await requireAdmin();
  void (await headers());

  const data = await fetchInitialTickets(accessToken);

  return (
    <AdminSupportClient
      initialTickets={data.tickets ?? []}
      initialTotal={data.total ?? 0}
      accessToken={accessToken}
      pageSize={PAGE_SIZE}
    />
  );
}
