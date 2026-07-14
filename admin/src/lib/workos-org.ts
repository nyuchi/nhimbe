/**
 * WorkOS organization scoping for the admin app.
 *
 * On top of the role gate (require-admin.ts), every admin requester must be an
 * ACTIVE member of the nyuchi WorkOS organization. Org membership is
 * *necessary* — a non-member is denied regardless of their identity.persons
 * role — but not *sufficient* (they still need the right role for a page).
 *
 * Resolving the allowed org:
 *   - `WORKOS_ADMIN_ORG_ID` env (preferred, precise, no lookup) wins outright.
 *   - Otherwise the org is resolved by its `nyuchi.com` domain via the WorkOS
 *     SDK and cached per server process (a positive hit only).
 *
 * Determining membership: the WorkOS `listOrganizationMemberships` API is the
 * source of truth (an ACTIVE membership in the allowed org). The AuthKit
 * session's `organizationId` is only a hint carried through for observability.
 *
 * Fail closed everywhere: if the org can't be resolved, or either WorkOS
 * lookup errors, access is DENIED — the gate never falls open.
 */

import "server-only";

import { getWorkOS } from "@workos-inc/authkit-nextjs";

/** The domain nhimbe's admins belong to when resolving the org by lookup. */
export const NYUCHI_ORG_DOMAIN = "nyuchi.com";

// Per-process cache for the domain-resolved org id. Only a positive hit is
// cached — a null/error resolution is never memoised so a transient WorkOS
// blip can recover on the next request instead of denying forever.
let cachedOrgId: string | null = null;

/** Test-only: clear the per-process org-id cache. */
export function __resetOrgCache(): void {
  cachedOrgId = null;
}

/**
 * The allowed admin org id, or null when it can't be resolved (→ deny).
 *
 * `WORKOS_ADMIN_ORG_ID` short-circuits the lookup. Without it, the org is
 * resolved once by domain and the positive result cached for the process.
 */
export async function resolveAllowedOrgId(): Promise<string | null> {
  const fromEnv = process.env.WORKOS_ADMIN_ORG_ID?.trim();
  if (fromEnv) return fromEnv;

  if (cachedOrgId) return cachedOrgId;

  try {
    const res = await getWorkOS().organizations.listOrganizations({
      domains: [NYUCHI_ORG_DOMAIN],
      limit: 1,
    });
    const id = res.data[0]?.id ?? null;
    if (id) cachedOrgId = id; // cache positives only
    return id;
  } catch (err) {
    console.error(
      "[mukoko] resolveAllowedOrgId: WorkOS organization lookup failed",
      err,
    );
    return null; // fail closed — never cache a failure
  }
}

/**
 * True when the WorkOS user holds an ACTIVE membership in the given org.
 * Fail-closed: any lookup error resolves to false (deny).
 */
export async function hasActiveOrgMembership(
  workosUserId: string,
  organizationId: string,
): Promise<boolean> {
  try {
    const res = await getWorkOS().userManagement.listOrganizationMemberships({
      userId: workosUserId,
      organizationId,
      statuses: ["active"],
      limit: 1,
    });
    return res.data.length > 0;
  } catch (err) {
    console.error(
      "[mukoko] hasActiveOrgMembership: WorkOS membership lookup failed",
      err,
    );
    return false; // fail closed
  }
}

/**
 * Pure gate decision (unit-testable without WorkOS): returns the allowed org
 * id when the requester may pass the org gate, or null when they must be
 * denied. Mirrors resolveAdminGate's shape.
 */
export function decideOrgGate(
  allowedOrgId: string | null,
  activeMembership: boolean,
): string | null {
  if (!allowedOrgId) return null; // org unresolved → deny (fail-closed)
  return activeMembership ? allowedOrgId : null;
}

export interface OrgGateInput {
  workosUserId: string;
  /** AuthKit session org (hint only — the API check is the source of truth). */
  sessionOrganizationId?: string | null;
}

/**
 * Resolve the allowed org and confirm the requester is an active member.
 * Returns the allowed org id on success, or null when they must be denied.
 * Fail-closed on every uncertainty (unresolved org, lookup error, no active
 * membership).
 */
export async function requireNyuchiOrgMembership(
  input: OrgGateInput,
): Promise<string | null> {
  const allowedOrgId = await resolveAllowedOrgId();
  if (!allowedOrgId) return null;

  const active = await hasActiveOrgMembership(input.workosUserId, allowedOrgId);
  if (!active && input.sessionOrganizationId) {
    // Session claimed an org but the authoritative API check disagrees — log
    // the mismatch (the API decision stands) for observability.
    console.warn(
      "[mukoko] requireNyuchiOrgMembership: session org present but no active membership in the allowed org",
    );
  }
  return decideOrgGate(allowedOrgId, active);
}
