/**
 * Server-side role gate for the /admin/* RSC pages. Looks up the requester's
 * identity.person.role via Supabase (using the WorkOS access token from
 * AuthKit) and redirects to "/" when the user is not at least an admin.
 *
 * This runs BEFORE any client-side admin bundle is shipped, so anonymous and
 * non-admin visitors never receive the admin code paths or the initial
 * admin-payload fetch.
 *
 * Mirrors `getAdminUser()` in worker/src/middleware/auth.ts and
 * personRowToNhimbeUser() in src/components/auth/auth-context.tsx, but on the
 * Node/server side of the Next.js bundle.
 */

import "server-only";

import { redirect } from "next/navigation";
import { withAuth } from "@workos-inc/authkit-nextjs";
import { getPersonByWorkosId } from "@/lib/mongo/users";

// Server-side mirror of UserRole / hasPermission from
// src/components/auth/auth-context.tsx. That module is "use client", so we
// can't call the function from here — keep the table local instead. The
// hierarchy MUST match auth-context.tsx; widen here if you widen there.
export type UserRole = "user" | "moderator" | "admin" | "super_admin";

const ROLE_RANK: Record<UserRole, number> = {
  user: 0,
  moderator: 1,
  admin: 2,
  super_admin: 3,
};

function hasRole(actual: UserRole, required: UserRole): boolean {
  return ROLE_RANK[actual] >= ROLE_RANK[required];
}

export type AdminRequester = {
  workosUserId: string;
  personId: string | null;
  role: UserRole;
  accessToken: string;
};

/**
 * Redirects to "/" if the caller is not signed in or doesn't hold the
 * required role. Returns the resolved requester on success.
 *
 * Default `requiredRole` is "admin" because the four pages this guards
 * (`/admin`, `/admin/users`, `/admin/events`, `/admin/support`) all hit
 * worker endpoints gated at admin. The layout still shows the dashboard
 * route to moderators, but the worker would 403 their fetches anyway.
 */
export async function requireAdmin(
  requiredRole: UserRole = "admin",
): Promise<AdminRequester> {
  const { user, accessToken } = await withAuth({ ensureSignedIn: true });
  // ensureSignedIn:true redirects unauthenticated users to the AuthKit flow,
  // so by the time we reach here both user and accessToken are present.

  let person: Awaited<ReturnType<typeof getPersonByWorkosId>>;
  try {
    person = await getPersonByWorkosId(user.id);
  } catch (err) {
    // Treat lookup failures as forbidden — better to bounce a real admin
    // to "/" once than to leak the admin shell when the cluster is wobbly.
    console.error("[mukoko] requireAdmin: identity.persons lookup failed", err);
    redirect("/");
  }

  // Suspended accounts and non-admins get bounced.
  const role = normaliseRole(person?.role);
  if (!person || person.suspended || !hasRole(role, requiredRole)) {
    redirect("/");
  }

  return {
    workosUserId: user.id,
    personId: person.personId,
    role,
    accessToken,
  };
}

function normaliseRole(value: string | null | undefined): UserRole {
  switch (value) {
    case "super_admin":
    case "admin":
    case "moderator":
    case "user":
      return value;
    default:
      return "user";
  }
}
