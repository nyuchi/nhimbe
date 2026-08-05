"use server";

/**
 * Entity-management server actions for account preferences.
 *
 * Backs the "Manage host entities" surface (`/profile/entities`): the signed-in
 * person is resolved server-side via `resolveActingPerson` (AuthKit / dev
 * bypass), then their hosting-capable entities are read from MongoDB with the
 * person's role on each and which one is their default. Two mutations are
 * exposed — rename a family/personal host entity, and set the default host
 * entity — both re-gated in the Mongo layer (`canManageHostEntity` /
 * membership check), entity-centric. WorkOS-owned organisation entities are
 * read-only here; only the family entity is editable.
 */

import { resolveActingPerson } from "@/lib/auth/current-person";
import {
  canManageHostEntity,
  createCommunityEntityForPerson,
  listHostEntitiesWithRoleForPerson,
  renameHostEntityForPerson,
  setDefaultHostEntityForPerson,
} from "@/lib/mongo/entities";
import type { EntityMembershipRole, EntityType } from "@/lib/mongo/types";

/** Client-safe row for the entity-management list (no `server-only` types). */
export interface ManagedHostEntity {
  id: string;
  name: string;
  entityType: EntityType;
  /** The signed-in person's effective (highest) hostable role on the entity. */
  role: EntityMembershipRole;
  /** Whether this is the person's default host entity. */
  isDefault: boolean;
  /** Whether the person may rename it here (family entity + manage role). */
  editable: boolean;
  /** Verified when the entity holds a bundu verification tier ≥ 2. */
  verified: boolean;
  /** Members count when the entity denormalises it (organisation entities). */
  memberCount: number | null;
}

export interface EntityManagement {
  entities: ManagedHostEntity[];
  defaultEntityId: string | null;
}

/**
 * Read the signed-in person's host entities with role + default flags. Returns
 * an empty management view (never throws) for anonymous visitors — the page is
 * AuthGuard-gated, so this is only a defensive fallback.
 */
export async function getMyEntityManagement(): Promise<EntityManagement> {
  try {
    const person = await resolveActingPerson();
    if (!person) return { entities: [], defaultEntityId: null };

    const defaultEntityId = person.bundu?.defaultFamilyEntityId ?? null;
    const rows = await listHostEntitiesWithRoleForPerson(person._id);

    const entities: ManagedHostEntity[] = rows.map(({ entity, role }) => ({
      id: entity._id,
      name: entity.name,
      entityType: entity.entityType,
      role,
      isDefault: entity._id === defaultEntityId,
      editable: canManageHostEntity(role, entity.entityType),
      verified: (entity.bundu?.verificationTier ?? 0) >= 2,
      memberCount: entity.memberCount ?? null,
    }));

    // Personal/family entities first, then default, then name.
    entities.sort((a, b) => {
      if (a.entityType !== b.entityType) return a.entityType === "family" ? -1 : 1;
      if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    return { entities, defaultEntityId };
  } catch (err) {
    console.error("[mukoko] getMyEntityManagement failed:", err);
    return { entities: [], defaultEntityId: null };
  }
}

/**
 * Rename the acting person's family host entity. Gated server-side: the person
 * must hold a manage-level role on a `family` entity. Returns the fresh
 * management view so the client re-renders from authoritative state.
 */
export async function renameMyHostEntity(
  entityId: string,
  name: string,
): Promise<EntityManagement> {
  const person = await resolveActingPerson();
  if (!person) throw new Error("You must be signed in to manage your entities.");

  await renameHostEntityForPerson({ personId: person._id, entityId, name });
  return getMyEntityManagement();
}

/**
 * Set the acting person's default host entity. Gated server-side: the person
 * must hold an active hostable membership on the target entity. Returns the
 * fresh management view.
 */
export async function setMyDefaultHostEntity(entityId: string): Promise<EntityManagement> {
  const person = await resolveActingPerson();
  if (!person) throw new Error("You must be signed in to manage your entities.");

  await setDefaultHostEntityForPerson({ personId: person._id, entityId });
  return getMyEntityManagement();
}

/**
 * Create a community entity (a club, social enterprise, or other group the
 * person runs themselves) and join it as founder. The one in-app path to a
 * second host entity — an `organization` entity still only ever arrives via
 * a WorkOS org invite (read-only here). Returns the fresh management view so
 * the new entity shows up immediately, including in the create-event host
 * picker, which reads the same underlying membership.
 */
export async function createMyCommunityEntity(input: {
  name: string;
  description?: string | null;
}): Promise<EntityManagement> {
  const person = await resolveActingPerson();
  if (!person) throw new Error("You must be signed in to create a community.");

  await createCommunityEntityForPerson({
    personId: person._id,
    name: input.name,
    description: input.description ?? null,
  });
  return getMyEntityManagement();
}
