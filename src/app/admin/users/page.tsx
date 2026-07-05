/**
 * /admin/users — server component.
 *
 * Server-side AuthKit gate + role check happen before any admin code is
 * shipped to the browser. The first page of users is read directly from
 * MongoDB (identity.persons); the client takes over for search / pagination /
 * suspend via the admin server actions.
 */

import { headers } from "next/headers";
import AdminUsersClient from "./admin-users-client";
import { listAdminUsers, type AdminUsersResult } from "@/lib/mongo/admin";
import { requireAdmin } from "../require-admin";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;

export default async function AdminUsersPage() {
  await requireAdmin();
  void (await headers());

  let data: AdminUsersResult;
  try {
    data = await listAdminUsers({ limit: PAGE_SIZE, offset: 0 });
  } catch (err) {
    console.error("[mukoko] /admin/users: mongo read failed", err);
    data = { users: [], total: 0 };
  }

  return (
    <AdminUsersClient
      initialUsers={data.users}
      initialTotal={data.total}
      pageSize={PAGE_SIZE}
    />
  );
}
