/**
 * Server-side role gate for every admin route — the contract extracted from
 * the public app's src/app/admin/require-admin.ts, preserved verbatim:
 *
 *  - Runs BEFORE any client admin bundle ships: anonymous visitors are
 *    bounced into the WorkOS hosted sign-in (with a return_to back to the
 *    requested admin path) by `withAuth({ ensureSignedIn: true })`.
 *  - The requester must hold an ACTIVE staff membership on the Nyuchi entity
 *    in `entity.memberships` (`requireNyuchiMembership` — the platform's own
 *    RBAC, replacing the former WorkOS org-membership API check). Anyone who
 *    authenticates without one is denied regardless of role — membership is
 *    necessary, not sufficient. Fail-closed: an unresolvable entity or a
 *    cluster lookup error denies. WorkOS is authentication-only.
 *  - The requester's `identity.persons.role` decides access on top of the
 *    membership gate; suspended accounts and everyone below the required role
 *    are denied.
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
import { isDevBypass, DEV_WORKOS_ID } from "@/lib/auth/dev";
import { requireNyuchiMembership } from "./nyuchi-membership";
import { hasRole, normaliseRole, type UserRole } from "./roles";

export { hasRole, normaliseRole };
export type { UserRole };

/** The person shape the gate decision needs (subset of AppUser). */
export interface GatePerson {
  personId: string;
  role?: string | null;
  suspended?: boolean;
  /** Underlying activation flag — `false` is a hard deny, independent of role. */
  isActive?: boolean;
}

/**
 * Pure gate decision — exported separately so the deny semantics are unit
 * testable without AuthKit. Returns the resolved role when the person may
 * pass, or null when they must be denied.
 *
 * Suspension is keyed on activation, NOT on a role literal: a denied account
 * is one where `suspended` is set OR `isActive === false`. Suspension is
 * decoupled from `role` (the admin suspend action flips `isActive` and leaves
 * `role` intact), so the gate must reject an inactive account whatever role it
 * still carries.
 */
export function resolveAdminGate(
  person: GatePerson | null,
  requiredRole: UserRole,
): UserRole | null {
  if (!person || person.suspended || person.isActive === false) return null;
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
 * pages AND the shell layout gate at admin (there is no moderator-accessible
 * surface); settings gates at super_admin.
 */
export async function requireAdmin(
  requiredRole: UserRole = "admin",
): Promise<AdminRequester> {
  // Local-only dev bypass — same double gate as the public app
  // (NODE_ENV !== "production" AND DEV_AUTH_BYPASS=1), impossible on any
  // Vercel deployment. The synthetic dev person still flows through the REAL
  // gate decision so the deny path is exercisable locally via DEV_AUTH_ROLE
  // (defaults to super_admin).
  if (isDevBypass()) {
    const devRole = normaliseRole(process.env.DEV_AUTH_ROLE ?? "super_admin");
    const role = resolveAdminGate(
      { personId: DEV_WORKOS_ID, role: devRole, suspended: false },
      requiredRole,
    );
    if (role === null) {
      redirect("/denied");
    }
    return {
      workosUserId: DEV_WORKOS_ID,
      personId: DEV_WORKOS_ID,
      role,
      accessToken: "",
    };
  }

  const { user, accessToken } = await withAuth({
    ensureSignedIn: true,
  });
  // ensureSignedIn:true redirects unauthenticated users to the AuthKit flow,
  // so by the time we reach here both user and accessToken are present.

  let person: Awaited<ReturnType<typeof getPersonByWorkosId>>;
  try {
    person = await getPersonByWorkosId(user.id);
  } catch (err) {
    console.error("[mukoko] requireAdmin: identity.persons lookup failed", err);
    redirect("/denied");
  }
  if (!person) {
    redirect("/denied");
  }

  // Membership gate — the requester must hold an ACTIVE staff membership on
  // the Nyuchi entity (entity.memberships, keyed by personId — hence after
  // the person lookup). Denied regardless of role without one. Fail-closed:
  // requireNyuchiMembership returns null on an unresolvable entity or any
  // cluster lookup error.
  const allowedEntityId = await requireNyuchiMembership({
    personId: person.personId,
  });
  if (allowedEntityId === null) {
    redirect("/denied");
  }

  const role = resolveAdminGate(person, requiredRole);
  if (role === null) {
    redirect("/denied");
  }

  return {
    workosUserId: user.id,
    personId: person.personId,
    role,
    accessToken,
  };
}
