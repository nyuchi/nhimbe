/**
 * /entities — server component. requireAdmin() + first page of
 * entity.entities (with membership counts) straight from Mongo.
 */

import { headers } from "next/headers";
import EntitiesClient from "./entities-client";
import { listAdminEntities, type AdminEntitiesResult } from "@/lib/mongo/admin";
import { requireAdmin } from "@admin/lib/require-admin";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;

export default async function AdminEntitiesPage() {
  await requireAdmin();
  void (await headers());

  let data: AdminEntitiesResult;
  try {
    data = await listAdminEntities({ limit: PAGE_SIZE, offset: 0 });
  } catch (err) {
    console.error("[mukoko] admin/entities: mongo read failed", err);
    data = { entities: [], total: 0 };
  }

  return (
    <EntitiesClient
      initialEntities={data.entities}
      initialTotal={data.total}
      pageSize={PAGE_SIZE}
    />
  );
}
