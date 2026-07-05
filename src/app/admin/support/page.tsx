/**
 * /admin/support — server component.
 *
 * AuthKit + identity.person.role gate runs server-side so the admin support
 * bundle never ships to anonymous or non-admin visitors.
 *
 * NOTE: support tickets are NOT modelled in the Mukoko v3.1 schema — there is
 * no ticket collection on the cluster. `listSupportTickets()` returns an empty
 * page; the client still renders its (empty) queue, status filters and thread
 * UI so the surface is ready for when a tickets collection lands.
 */

import { headers } from "next/headers";
import AdminSupportClient from "./admin-support-client";
import { listSupportTickets, type SupportTicketsResult } from "@/lib/mongo/admin";
import { requireAdmin } from "../require-admin";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;

export default async function AdminSupportPage() {
  await requireAdmin();
  void (await headers());

  const data: SupportTicketsResult = await listSupportTickets({
    limit: PAGE_SIZE,
    offset: 0,
  });

  return (
    <AdminSupportClient
      initialTickets={data.items}
      initialTotal={data.total}
      pageSize={PAGE_SIZE}
    />
  );
}
