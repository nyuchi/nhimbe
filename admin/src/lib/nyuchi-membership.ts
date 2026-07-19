/**
 * Nyuchi entity-membership scoping for the admin app — the platform's OWN
 * RBAC substrate (`entity.memberships`), replacing the former WorkOS
 * organization-membership API check (workos-org.ts).
 *
 * On top of the role gate (require-admin.ts), every admin requester must hold
 * an ACTIVE staff membership on the Nyuchi entity in `entity.memberships`.
 * Membership is *necessary* — a non-member is denied regardless of their
 * identity.persons role — but not *sufficient* (they still need the right
 * role for a page). WorkOS remains authentication-only: no per-request WorkOS
 * API call is made.
 *
 * Resolving the allowed entity:
 *   - `NYUCHI_ADMIN_ENTITY_ID` env (preferred, precise, no lookup) wins.
 *   - Otherwise the entity is resolved by its `nyuchi-africa` slug in
 *     `entity.entities` and cached per server process (a positive hit only).
 *
 * Determining membership: an `entity.memberships` row for
 * (personId, entityId) with `isActive: true` and a STAFF membershipRole.
 * Follower/contributor/kin rows do NOT grant admin passage.
 *
 * Fail closed everywhere: if the entity can't be resolved, or either cluster
 * lookup errors, access is DENIED — the gate never falls open.
 */

import "server-only";

import {
  entitiesCollection,
  entityMembershipsCollection,
} from "@/lib/mongo/databases";
import type { EntityMembershipRole } from "@/lib/mongo/types";

/** The slug the Nyuchi entity is resolved by when no env id is set. */
export const NYUCHI_ENTITY_SLUG = "nyuchi-africa";

/**
 * Membership roles that count as staff for admin passage. Mirrors the
 * HOSTABLE_ROLES idea in src/lib/mongo/entities.ts plus plain `member`
 * (the equivalent of former WorkOS org membership); follower/contributor/kin
 * are audience relations, not staff.
 */
export const ADMIN_MEMBERSHIP_ROLES: EntityMembershipRole[] = [
  "founder",
  "admin",
  "manager",
  "representative",
  "member",
];

// Per-process cache for the slug-resolved entity id. Only a positive hit is
// cached — a null/error resolution is never memoised so a transient cluster
// blip can recover on the next request instead of denying forever.
let cachedEntityId: string | null = null;

/** Test-only: clear the per-process entity-id cache. */
export function __resetEntityCache(): void {
  cachedEntityId = null;
}

/**
 * The allowed admin entity id, or null when it can't be resolved (→ deny).
 *
 * `NYUCHI_ADMIN_ENTITY_ID` short-circuits the lookup. Without it, the entity
 * is resolved once by slug and the positive result cached for the process.
 */
export async function resolveNyuchiEntityId(): Promise<string | null> {
  const fromEnv = process.env.NYUCHI_ADMIN_ENTITY_ID?.trim();
  if (fromEnv) return fromEnv;

  if (cachedEntityId) return cachedEntityId;

  try {
    const entities = await entitiesCollection();
    const doc = await entities.findOne(
      { slug: NYUCHI_ENTITY_SLUG, isActive: true },
      { projection: { _id: 1 } },
    );
    const id = doc?._id ?? null;
    if (id) cachedEntityId = id; // cache positives only
    return id;
  } catch (err) {
    console.error(
      "[mukoko] resolveNyuchiEntityId: entity lookup failed",
      err,
    );
    return null; // fail closed — never cache a failure
  }
}

/**
 * True when the person holds an ACTIVE staff membership on the given entity.
 * Fail-closed: any lookup error resolves to false (deny).
 */
export async function hasActiveNyuchiMembership(
  personId: string,
  entityId: string,
): Promise<boolean> {
  try {
    const memberships = await entityMembershipsCollection();
    const row = await memberships.findOne(
      {
        personId,
        entityId,
        isActive: true,
        membershipRole: { $in: ADMIN_MEMBERSHIP_ROLES },
      },
      { projection: { _id: 1 } },
    );
    return row !== null;
  } catch (err) {
    console.error(
      "[mukoko] hasActiveNyuchiMembership: membership lookup failed",
      err,
    );
    return false; // fail closed
  }
}

/**
 * Pure gate decision (unit-testable without the cluster): returns the allowed
 * entity id when the requester may pass the membership gate, or null when
 * they must be denied. Mirrors resolveAdminGate's shape.
 */
export function decideMembershipGate(
  allowedEntityId: string | null,
  activeMembership: boolean,
): string | null {
  if (!allowedEntityId) return null; // entity unresolved → deny (fail-closed)
  return activeMembership ? allowedEntityId : null;
}

export interface MembershipGateInput {
  /** The requester's identity.persons id (string UUID). */
  personId: string;
}

/**
 * Resolve the Nyuchi entity and confirm the requester holds an active staff
 * membership. Returns the entity id on success, or null when they must be
 * denied. Fail-closed on every uncertainty (unresolved entity, lookup error,
 * no active staff membership).
 */
export async function requireNyuchiMembership(
  input: MembershipGateInput,
): Promise<string | null> {
  const allowedEntityId = await resolveNyuchiEntityId();
  if (!allowedEntityId) return null;

  const active = await hasActiveNyuchiMembership(
    input.personId,
    allowedEntityId,
  );
  return decideMembershipGate(allowedEntityId, active);
}
