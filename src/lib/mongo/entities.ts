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
import {
  entitiesCollection,
  entityMembershipsCollection,
  personsCollection,
} from "./databases";
import { newId, slugify, stampNew } from "./ids";
import type { EntityDoc, EntityMembershipDoc, EntityMembershipRole, PersonDoc } from "./types";

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
