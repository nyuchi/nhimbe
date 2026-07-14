/**
 * Server-side role gate for every admin route — the contract extracted from
 * the public app's src/app/admin/require-admin.ts, preserved verbatim:
 *
 *  - Runs BEFORE any client admin bundle ships: anonymous visitors are
 *    bounced into the WorkOS hosted sign-in (with a return_to back to the
 *    requested admin path) by `withAuth({ ensureSignedIn: true })`.
 *  - The requester's `identity.persons.role` decides access; suspended
 *    accounts and everyone below the required role are denied.
 *  - Lookup failures are treated as forbidden — better to bounce a real
 *    admin once than to leak the admin shell when the cluster is wobbly.
 *
 * One deliberate difference from the in-app original: a denied requester is
 * redirected to this app's `/denied` screen (a clear access-denied page)
 * instead of the public home — the public site lives on another origin now.
 */

import "server-only";

import { redirect } from "next/navigation";
import { withAuth } from "@workos-inc/authkit-nextjs";
import { getPersonByWorkosId } from "@/lib/mongo/users";

// Server-side mirror of the UserRole hierarchy from the public app's
// auth-context. The hierarchy MUST match; widen here if you widen there.
export type UserRole = "user" | "moderator" | "admin" | "super_admin";

const ROLE_RANK: Record<UserRole, number> = {
  user: 0,
  moderator: 1,
  admin: 2,
  super_admin: 3,
};

export function hasRole(actual: UserRole, required: UserRole): boolean {
  return ROLE_RANK[actual] >= ROLE_RANK[required];
}

export function normaliseRole(value: string | null | undefined): UserRole {
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

/** The person shape the gate decision needs (subset of AppUser). */
export interface GatePerson {
  personId: string;
  role?: string | null;
  suspended?: boolean;
}

/**
 * Pure gate decision — exported separately so the deny semantics are unit
 * testable without AuthKit. Returns the resolved role when the person may
 * pass, or null when they must be denied.
 */
export function resolveAdminGate(
  person: GatePerson | null,
  requiredRole: UserRole,
): UserRole | null {
  if (!person || person.suspended) return null;
  const role = normaliseRole(person.role);
  return hasRole(role, requiredRole) ? role : null;
}

export type AdminRequester = {
  workosUserId: string;
  personId: string;
  role: UserRole;
  accessToken: string;
};

/**
 * Redirects to the hosted sign-in if the caller is anonymous, or to /denied
 * if they don't hold the required role. Returns the resolved requester on
 * success.
 *
 * Default `requiredRole` is "admin" (the extracted contract): the data-bearing
 * pages gate at admin; the shell layout gates at "moderator" so moderators can
 * see the navigation with locked items, exactly like the old in-app layout.
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
    console.error("[mukoko] requireAdmin: identity.persons lookup failed", err);
    redirect("/denied");
  }

  const role = resolveAdminGate(person, requiredRole);
  if (!person || role === null) {
    redirect("/denied");
  }

  return {
    workosUserId: user.id,
    personId: person.personId,
    role,
    accessToken,
  };
}
