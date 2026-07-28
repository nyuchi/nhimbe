/**
 * Entity reads + host-entity resolution.
 *
 * Hosting in the v3.1 model is entity-centric: a person acts THROUGH an entity
 * (their default family entity, an organisation, etc.), never directly. Per
 * the platform's Rule 10 every person has a default family entity; on a fresh
 * cluster that may not exist yet, so `ensureHostEntityForPerson` creates one
 * lazily the first time a person needs to host something.
 *
 * Server-only — pulls the Mongo collection accessors.
 */

import "server-only";
import type { Filter, UpdateFilter } from "mongodb";
import {
  entitiesCollection,
  entityMembershipsCollection,
  personsCollection,
} from "./databases";
import { newId, slugify, stampNew, WRITE_SCHEMA_VERSION } from "./ids";
import { ensurePersonForWorkosId } from "./users";
import type {
  EntityDoc,
  EntityMembershipDoc,
  EntityMembershipRole,
  EntityType,
  PersonDoc,
} from "./types";

export async function getEntityById(id: string): Promise<EntityDoc | null> {
  const col = await entitiesCollection();
  return col.findOne({ _id: id });
}

/** A contactable email + display name for an entity's host — for notifications. */
export interface HostContact {
  email: string;
  name: string | null;
}

/**
 * Resolve a contact (email + display name) for the human hosting through an
 * entity — the person to notify about activity on the entity's events. Prefers
 * the founder person's identity email, falling back to the entity's own contact
 * email. Returns null when nothing usable is on file (caller should skip
 * silently, never throw).
 */
export async function getHostContactForEntity(entityId: string): Promise<HostContact | null> {
  const entity = await getEntityById(entityId);
  if (!entity) return null;

  // Prefer the founder person's identity email/name.
  if (entity.founderPersonId) {
    const persons = await personsCollection();
    const founder = await persons.findOne({ _id: entity.founderPersonId });
    if (founder?.email) {
      return { email: founder.email, name: founder.name ?? entity.name ?? null };
    }
  }

  // Fall back to the entity's own contact email.
  if (entity.email) {
    return { email: entity.email, name: entity.name ?? null };
  }

  return null;
}

/** Membership roles that let a person host events on an entity's behalf. */
const HOSTABLE_ROLES: EntityMembershipRole[] = ["founder", "admin", "manager", "representative"];

/**
 * List the entities a person can host through — the entities where they hold a
 * hosting-capable, active membership. Batched: memberships in one query, then
 * the entities in one `$in` query.
 */
export async function listHostEntitiesForPerson(personId: string): Promise<EntityDoc[]> {
  const memberships = await entityMembershipsCollection();
  const mships = await memberships
    .find({ personId, isActive: true, membershipRole: { $in: HOSTABLE_ROLES } })
    .toArray();
  const entityIds = [...new Set(mships.map((m) => m.entityId))];
  if (entityIds.length === 0) return [];
  const entities = await entitiesCollection();
  return entities.find({ _id: { $in: entityIds }, isActive: true }).toArray();
}

// ── Entity management (account preferences) ────────────────────────────
//
// The account-preferences "Manage host entities" surface lets a person see the
// entities they can host through, rename their own personal/family entity, and
// pick which one is their default. WorkOS-owned organisation entities are
// read-only here (created/renamed via WorkOS, mirrored by the webhook) — only a
// person's `family` entity is editable, and only by someone with a manage-level
// role on it.

/** Membership roles that may rename/manage a family host entity. */
const MANAGE_ROLES: readonly EntityMembershipRole[] = ["founder", "admin", "manager"];

/** Rank hostable roles so the highest role a person holds on an entity wins. */
const ROLE_RANK: Record<string, number> = {
  founder: 4,
  admin: 3,
  manager: 2,
  representative: 1,
};

/**
 * A host entity paired with the acting person's effective role on it. `role` is
 * the highest hostable role the person holds across their memberships on that
 * entity.
 */
export interface HostEntityWithRole {
  entity: EntityDoc;
  role: EntityMembershipRole;
}

/**
 * Whether a person holding `role` on an entity of `entityType` may rename it.
 * Pure so it can be reused by the gate on the write path and asserted in tests.
 * Only `family` entities are editable in nhimbe — organisation entities are
 * WorkOS-owned and read-only here.
 */
export function canManageHostEntity(
  role: EntityMembershipRole,
  entityType: EntityType,
): boolean {
  return entityType === "family" && MANAGE_ROLES.includes(role);
}

/**
 * List the entities a person can host through, each paired with the person's
 * effective (highest) hostable role. Same active-membership predicate as
 * {@link listHostEntitiesForPerson}, batched the same way.
 */
export async function listHostEntitiesWithRoleForPerson(
  personId: string,
): Promise<HostEntityWithRole[]> {
  const memberships = await entityMembershipsCollection();
  const mships = await memberships
    .find({ personId, isActive: true, membershipRole: { $in: HOSTABLE_ROLES } })
    .toArray();

  const roleByEntity = new Map<string, EntityMembershipRole>();
  for (const m of mships) {
    const current = roleByEntity.get(m.entityId);
    if (!current || (ROLE_RANK[m.membershipRole] ?? 0) > (ROLE_RANK[current] ?? 0)) {
      roleByEntity.set(m.entityId, m.membershipRole);
    }
  }

  const entityIds = [...roleByEntity.keys()];
  if (entityIds.length === 0) return [];
  const entities = await entitiesCollection();
  const docs = await entities.find({ _id: { $in: entityIds }, isActive: true }).toArray();
  return docs.map((entity) => ({ entity, role: roleByEntity.get(entity._id)! }));
}

/**
 * The acting person's highest hostable role on one entity, or `null` when they
 * hold no active hostable membership on it. The authorisation primitive behind
 * the rename / set-default writes.
 */
export async function getPersonHostRoleForEntity(
  personId: string,
  entityId: string,
): Promise<EntityMembershipRole | null> {
  const memberships = await entityMembershipsCollection();
  const mships = await memberships
    .find({ personId, entityId, isActive: true, membershipRole: { $in: HOSTABLE_ROLES } })
    .toArray();
  if (mships.length === 0) return null;
  let best: EntityMembershipRole | null = null;
  for (const m of mships) {
    if (!best || (ROLE_RANK[m.membershipRole] ?? 0) > (ROLE_RANK[best] ?? 0)) {
      best = m.membershipRole;
    }
  }
  return best;
}

/**
 * Rename a person's family host entity. Gated: the person must hold a
 * manage-level role on the entity AND the entity must be of type `family`
 * (organisation entities are WorkOS-owned, read-only here). Throws on a missing
 * entity or an unauthorised caller; returns the updated entity. The slug is
 * regenerated from the new name (with the usual random suffix for uniqueness).
 */
export async function renameHostEntityForPerson(params: {
  personId: string;
  entityId: string;
  name: string;
}): Promise<EntityDoc> {
  const name = params.name.trim();
  if (!name) throw new Error("A name is required.");
  if (name.length > 120) throw new Error("That name is too long.");

  const entity = await getEntityById(params.entityId);
  if (!entity) throw new Error("That entity could not be found.");

  const role = await getPersonHostRoleForEntity(params.personId, params.entityId);
  if (!role || !canManageHostEntity(role, entity.entityType)) {
    throw new Error("You do not have permission to rename this entity.");
  }

  const entities = await entitiesCollection();
  const updated = await entities.findOneAndUpdate(
    { _id: params.entityId },
    { $set: { name, slug: slugify(name), updatedAt: new Date() } },
    { returnDocument: "after" },
  );
  if (!updated) throw new Error("That entity could not be updated.");
  return updated;
}

/**
 * Set a person's default host entity (`identity.persons.bundu.defaultFamilyEntityId`).
 * Gated: the person must hold an active hostable membership on the target
 * entity — you can only default to an entity you can actually host through.
 * Throws when the person cannot host through the entity.
 */
export async function setDefaultHostEntityForPerson(params: {
  personId: string;
  entityId: string;
}): Promise<void> {
  const role = await getPersonHostRoleForEntity(params.personId, params.entityId);
  if (!role) {
    throw new Error("You can only default to an entity you host through.");
  }
  const persons = await personsCollection();
  await persons.updateOne(
    { _id: params.personId },
    { $set: { "bundu.defaultFamilyEntityId": params.entityId, updatedAt: new Date() } },
  );
}

/**
 * Resolve the entity a person hosts through, creating their default family
 * entity (+ founder membership) on first use. Returns the entity id.
 */
export async function ensureHostEntityForPerson(person: PersonDoc): Promise<string> {
  // Reuse the recorded default family entity when it still exists.
  const existingId = person.bundu?.defaultFamilyEntityId;
  if (existingId) {
    const existing = await getEntityById(existingId);
    if (existing) return existing._id;
  }

  const name = person.name?.trim() || "My gatherings";
  const entityId = newId();
  const now = new Date();

  const entities = await entitiesCollection();
  await entities.insertOne({
    ...stampNew(entityId),
    entityType: "family",
    ecosystemRole: "external",
    schemaOrgType: "Person",
    slug: slugify(name),
    name,
    isActive: true,
    isPrivateByDefault: true,
    founderPersonId: person._id,
  } as EntityDoc);

  // Link the person to their host entity as founder.
  const memberships = await entityMembershipsCollection();
  await memberships.insertOne({
    ...stampNew(),
    personId: person._id,
    entityId,
    membershipRole: "founder",
    isActive: true,
    joinedAt: now,
  } as EntityMembershipDoc);

  // Record it as the person's default so we reuse it next time.
  const persons = await personsCollection();
  await persons.updateOne(
    { _id: person._id },
    { $set: { "bundu.defaultFamilyEntityId": entityId, updatedAt: now } },
  );

  return entityId;
}

// ── WorkOS organization → entity membership mirror (issue #70) ─────────
//
// WorkOS organization memberships are mirrored into `entity.memberships` so a
// user added to an org in WorkOS can immediately host through the matching
// Mukoko entity. The join keys are the validator-permitted extra fields
// `entity.entities.workosOrganizationId` (org_…) and
// `entity.memberships.workosOrganizationMembershipId` (om_…) — see types.ts.

/** The event fields the mirror needs from a WorkOS `organization_membership.*` payload. */
export interface WorkosOrgMembershipInput {
  /** WorkOS organization membership id (`om_…`). */
  workosOrganizationMembershipId: string;
  /** WorkOS organization id (`org_…`) — resolved to an entity via the join key. */
  workosOrganizationId: string;
  /** Display name for a first-seen organization's entity. */
  organizationName?: string | null;
  /** WorkOS user id (`user_…`) — resolved/stubbed to an `identity.persons` doc. */
  workosUserId: string;
  /** WorkOS role slug (e.g. "admin", "member"). */
  roleSlug?: string | null;
  /** WorkOS membership status. Only "active" grants an active membership. */
  status?: "active" | "inactive" | "pending" | null;
}

/**
 * Map a WorkOS role slug onto the v3.1 membership-role enum. Slugs that
 * already match the enum pass through; WorkOS's default "admin"/"member" map
 * 1:1; anything unknown degrades to plain "member" (never escalates).
 */
const MEMBERSHIP_ROLES: ReadonlySet<string> = new Set([
  "founder",
  "admin",
  "manager",
  "representative",
  "member",
  "contributor",
  "follower",
  "kin",
]);

export function workosRoleToMembershipRole(slug: string | null | undefined): EntityMembershipRole {
  const normalized = slug?.trim().toLowerCase();
  if (normalized && MEMBERSHIP_ROLES.has(normalized)) return normalized as EntityMembershipRole;
  return "member";
}

/**
 * Resolve the entity mirroring a WorkOS organization, creating a minimal
 * validator-complete organization entity on first sight. `$setOnInsert`-only
 * upsert keyed on the `workosOrganizationId` join key — idempotent, and an
 * existing entity (name, slug, …) is never overwritten.
 */
export async function ensureEntityForWorkosOrg(params: {
  workosOrganizationId: string;
  organizationName?: string | null;
}): Promise<EntityDoc> {
  const entities = await entitiesCollection();
  const name = params.organizationName?.trim() || "Organisation";
  const doc = await entities.findOneAndUpdate(
    { workosOrganizationId: params.workosOrganizationId },
    {
      $setOnInsert: {
        ...stampNew(),
        // workosOrganizationId is supplied by the filter on insert.
        entityType: "organization",
        ecosystemRole: "external",
        schemaOrgType: "Organization",
        slug: slugify(name),
        name,
        isActive: true,
        isPrivateByDefault: false,
      },
    },
    { upsert: true, returnDocument: "after" },
  );
  if (!doc) throw new Error("[mukoko] entity.entities ensure returned null");
  return doc;
}

/**
 * Build the idempotent `(filter, update)` pair mirroring one WorkOS
 * organization membership onto `entity.memberships`. Pure and exported so
 * tests can assert the emitted document carries every validator-required
 * field: the filter contributes `personId` + `entityId` on insert,
 * `$setOnInsert` the immutable required fields, `$set` the mutable ones.
 * Keying on `(personId, entityId)` makes created/updated replays converge on
 * the single membership row.
 */
export function buildWorkosMembershipWrite(params: {
  personId: string;
  entityId: string;
  membershipRole: EntityMembershipRole;
  isActive: boolean;
  workosOrganizationMembershipId: string;
  workosOrganizationId: string;
}): {
  filter: Filter<EntityMembershipDoc>;
  update: UpdateFilter<EntityMembershipDoc>;
} {
  const now = new Date();
  return {
    filter: { personId: params.personId, entityId: params.entityId },
    update: {
      $set: {
        membershipRole: params.membershipRole,
        isActive: params.isActive,
        workosOrganizationMembershipId: params.workosOrganizationMembershipId,
        workosOrganizationId: params.workosOrganizationId,
        // A reactivation clears a previous end; a deactivation stamps one.
        endedAt: params.isActive ? null : now,
        updatedAt: now,
      },
      $setOnInsert: {
        _id: newId(),
        _schemaVersion: WRITE_SCHEMA_VERSION,
        joinedAt: now,
        createdAt: now,
      },
    },
  };
}

/**
 * Mirror a WorkOS `organization_membership.created|updated` event: ensure the
 * person (stub if unseen) and the organization's entity exist, then upsert the
 * single `(personId, entityId)` membership row. Idempotent — replays and
 * status/role changes update in place. Throws on driver failure; the webhook
 * route catches and answers 500 so WorkOS retries.
 */
export async function mirrorWorkosOrganizationMembership(
  input: WorkosOrgMembershipInput,
): Promise<void> {
  const person = await ensurePersonForWorkosId(input.workosUserId);
  const entity = await ensureEntityForWorkosOrg({
    workosOrganizationId: input.workosOrganizationId,
    organizationName: input.organizationName,
  });

  const memberships = await entityMembershipsCollection();
  const { filter, update } = buildWorkosMembershipWrite({
    personId: person._id,
    entityId: entity._id,
    membershipRole: workosRoleToMembershipRole(input.roleSlug),
    isActive: input.status === "active",
    workosOrganizationMembershipId: input.workosOrganizationMembershipId,
    workosOrganizationId: input.workosOrganizationId,
  });
  await memberships.updateOne(filter, update, { upsert: true });
}

/**
 * End a mirrored membership when WorkOS reports
 * `organization_membership.deleted`. Deliberately NOT an upsert — deleting a
 * membership that was never mirrored must not create a row. Keyed on the
 * `om_…` join key, so only WorkOS-mirrored rows are ever ended.
 */
export async function endWorkosOrganizationMembership(params: {
  workosOrganizationMembershipId: string;
}): Promise<void> {
  const memberships = await entityMembershipsCollection();
  const now = new Date();
  await memberships.updateOne(
    { workosOrganizationMembershipId: params.workosOrganizationMembershipId },
    { $set: { isActive: false, endedAt: now, updatedAt: now } },
  );
}
