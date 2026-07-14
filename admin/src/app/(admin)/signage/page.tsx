/**
 * /signage — server component wrapper.
 *
 * The signage display itself (kiosk pairing + the live analytics wall) is the
 * client component ported as-is from the public app's /admin/signage. Unlike
 * the old page — which was client-only and relied on the layout's client-side
 * check — this wrapper adds the server-side requireAdmin() gate the extracted
 * contract demands on every route.
 */

import { headers } from "next/headers";
import AdminSignageClient from "./signage-client";
import { requireAdmin } from "@admin/lib/require-admin";

export const dynamic = "force-dynamic";

export default async function AdminSignagePage() {
  await requireAdmin();
  void (await headers());

  return <AdminSignageClient />;
}
