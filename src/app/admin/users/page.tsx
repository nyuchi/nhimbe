/**
 * /admin/users — server component.
 *
 * Server-side AuthKit gate + role check happen before any admin code is
 * shipped to the browser. The first page of users is fetched server-side
 * from the worker; the client takes over for search / pagination / suspend.
 */

import { headers } from "next/headers";
import AdminUsersClient, {
  type AdminUser,
} from "./admin-users-client";
import { requireAdmin } from "../require-admin";

export const dynamic = "force-dynamic";

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ||
  "https://mukoko-nhimbe-api.nyuchi.workers.dev";

const PAGE_SIZE = 20;

type UsersResponse = {
  users?: AdminUser[];
  total?: number;
};

async function fetchInitialUsers(accessToken: string): Promise<UsersResponse> {
  const params = new URLSearchParams({
    limit: PAGE_SIZE.toString(),
    offset: "0",
  });
  try {
    const res = await fetch(`${API_URL}/api/admin/users?${params}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });
    if (!res.ok) {
      console.error(
        `[mukoko] /admin/users: worker /api/admin/users returned ${res.status}`,
      );
      return {};
    }
    return (await res.json()) as UsersResponse;
  } catch (err) {
    console.error("[mukoko] /admin/users: worker fetch failed", err);
    return {};
  }
}

export default async function AdminUsersPage() {
  const { accessToken } = await requireAdmin();
  void (await headers());

  const data = await fetchInitialUsers(accessToken);

  return (
    <AdminUsersClient
      initialUsers={data.users ?? []}
      initialTotal={data.total ?? 0}
      accessToken={accessToken}
      pageSize={PAGE_SIZE}
    />
  );
}
