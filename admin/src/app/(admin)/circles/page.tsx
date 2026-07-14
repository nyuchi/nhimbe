/**
 * /circles — server component. requireAdmin() + first page of
 * circles.circles straight from Mongo.
 */

import { headers } from "next/headers";
import CirclesClient from "./circles-client";
import { listAdminCircles, type AdminCirclesResult } from "@/lib/mongo/admin";
import { requireAdmin } from "@admin/lib/require-admin";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;

export default async function AdminCirclesPage() {
  await requireAdmin();
  void (await headers());

  let data: AdminCirclesResult;
  try {
    data = await listAdminCircles({ limit: PAGE_SIZE, offset: 0 });
  } catch (err) {
    console.error("[mukoko] admin/circles: mongo read failed", err);
    data = { circles: [], total: 0 };
  }

  return (
    <CirclesClient
      initialCircles={data.circles}
      initialTotal={data.total}
      pageSize={PAGE_SIZE}
    />
  );
}
