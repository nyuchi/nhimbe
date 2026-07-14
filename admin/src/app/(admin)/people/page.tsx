/**
 * /people — server component. requireAdmin() + first page of identity.persons
 * straight from Mongo; the client takes over for search / pagination /
 * role & suspension management via the admin server actions.
 */

import { headers } from "next/headers";
import PeopleClient from "./people-client";
import { listAdminUsers, type AdminUsersResult } from "@/lib/mongo/admin";
import { requireAdmin } from "@admin/lib/require-admin";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;

export default async function AdminPeoplePage() {
  await requireAdmin();
  void (await headers());

  let data: AdminUsersResult;
  try {
    data = await listAdminUsers({ limit: PAGE_SIZE, offset: 0 });
  } catch (err) {
    console.error("[mukoko] admin/people: mongo read failed", err);
    data = { users: [], total: 0 };
  }

  return (
    <PeopleClient
      initialUsers={data.users}
      initialTotal={data.total}
      pageSize={PAGE_SIZE}
    />
  );
}
