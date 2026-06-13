"use server";

/**
 * Host-card server action (Vercel server runtime → MongoDB).
 *
 * Replaces the browser-side Supabase reads the host card used to do
 * (`getEventHostInfo` + `ubuntu.impact_scores`). The browser can't talk to
 * MongoDB, so the fan-out runs here on the server.
 *
 * Hosting in the v3.1 model is ENTITY-centric (Rule 10): an event references
 * `entity.entities` via `primaryHostEntityId`, never a person directly. The
 * human behind the entity is resolved through `entity.memberships`
 * (entityId → personId), falling back to the entity's `founderPersonId`.
 *
 * The three host "flavours" the card renders map onto the entity model:
 *   - person       → a family entity standing in for an individual
 *                    (schemaOrgType "Person", e.g. the default host entity
 *                    every person gets). We surface the founder person's
 *                    name + avatar.
 *   - family       → a family entity that represents an actual family/kin group
 *   - organization → organization / community / place_owner entities
 *
 * Reputation (Ubuntu score, events organised, follower count) is read from the
 * host entity's `bundu.trustSignals` plus a live count of events the entity has
 * run. All fields default to 0 so a brand-new host's card stays clean.
 */

import "server-only";
import {
  entitiesCollection,
  entityMembershipsCollection,
  eventsCollection,
  personsCollection,
} from "@/lib/mongo/databases";
import type { EntityDoc, PersonDoc } from "@/lib/mongo/types";

export type HostOwnerType = "person" | "organization" | "family";

export interface EventHostInfo {
  ownerType: HostOwnerType;
  id: string;
  name: string;
  description: string | null;
  avatar: string | null;
  slug: string | null;
  verificationStatus: string | null;
}

export interface HostReputation {
  ubuntuScore: number;
  eventsOrganized: number;
  followerCount: number;
}

export interface EventHostCard {
  host: EventHostInfo;
  /** Present only for the "person" flavour, matching the legacy card. */
  reputation: HostReputation | null;
}

/** Pull a string URL out of the entity logo, which may be a string or a
 *  MediaObject-shaped record ({ url } / { contentUrl }). */
function entityLogoUrl(logo: EntityDoc["logo"]): string | null {
  if (!logo) return null;
  if (typeof logo === "string") return logo;
  const obj = logo as Record<string, unknown>;
  return (obj.url as string | undefined) ?? (obj.contentUrl as string | undefined) ?? null;
}

/** A family entity whose schema.org type is "Person" stands in for an
 *  individual host (e.g. the default host entity created per person), so the
 *  card renders the personal flavour rather than the family one. */
function isPersonalEntity(entity: EntityDoc): boolean {
  return entity.entityType === "family" && entity.schemaOrgType === "Person";
}

function classifyOwnerType(entity: EntityDoc): HostOwnerType {
  if (isPersonalEntity(entity)) return "person";
  if (entity.entityType === "family") return "family";
  return "organization";
}

/** Verification status string from the entity's trust tier, mirroring the
 *  legacy `entity.verification_status` the card checked for "verified". */
function verificationStatus(entity: EntityDoc): string | null {
  const tier = entity.bundu?.verificationTier ?? entity.bundu?.trustSignals?.verificationTier;
  if (typeof tier === "number" && tier > 0) return "verified";
  return null;
}

/** Resolve the person to attribute a personal host to: the entity's founder,
 *  else the earliest founder/admin membership. */
async function resolveHostPerson(entity: EntityDoc): Promise<PersonDoc | null> {
  const persons = await personsCollection();

  if (entity.founderPersonId) {
    const founder = await persons.findOne({ _id: entity.founderPersonId });
    if (founder) return founder;
  }

  const memberships = await entityMembershipsCollection();
  const membership = await memberships.findOne(
    { entityId: entity._id, isActive: true, membershipRole: { $in: ["founder", "admin"] } },
    { sort: { joinedAt: 1 } },
  );
  if (!membership) return null;
  return persons.findOne({ _id: membership.personId });
}

/** Count published/live events this entity has hosted (its "events organised"). */
async function countHostedEvents(entityId: string): Promise<number> {
  const events = await eventsCollection();
  return events.countDocuments({
    primaryHostEntityId: entityId,
    status: { $in: ["published", "live"] },
  });
}

/**
 * Resolve the host card for an event: the host (entity-centric, with the
 * founder person surfaced for personal hosts) plus reputation for the person
 * flavour. Returns null when the event or its host entity can't be resolved —
 * the card then renders nothing, matching the legacy behaviour.
 */
export async function getEventHostCard(eventId: string): Promise<EventHostCard | null> {
  if (!eventId) return null;

  const events = await eventsCollection();
  const event = await events.findOne(
    { $or: [{ _id: eventId }, { slug: eventId }] },
    { projection: { primaryHostEntityId: 1 } },
  );
  if (!event?.primaryHostEntityId) return null;

  const entities = await entitiesCollection();
  const entity = await entities.findOne({ _id: event.primaryHostEntityId });
  if (!entity) return null;

  const ownerType = classifyOwnerType(entity);

  // For a personal host, prefer the founder person's name + avatar; otherwise
  // present the entity itself.
  const person = ownerType === "person" ? await resolveHostPerson(entity) : null;

  const host: EventHostInfo = {
    ownerType,
    id: entity._id,
    name:
      (ownerType === "person"
        ? person?.name?.trim() ||
          `${person?.givenName ?? ""} ${person?.familyName ?? ""}`.trim()
        : entity.name) || entity.name || "Unknown",
    description: entity.description ?? null,
    avatar: ownerType === "person" ? (person?.picture ?? null) : entityLogoUrl(entity.logo),
    slug: entity.slug ?? null,
    verificationStatus: verificationStatus(entity),
  };

  // Reputation only makes sense for the Person branch — Family and Organization
  // hosts use the verification badge instead.
  let reputation: HostReputation | null = null;
  if (ownerType === "person") {
    const trust = entity.bundu?.trustSignals;
    const eventsOrganized = await countHostedEvents(entity._id);
    reputation = {
      ubuntuScore: Number(trust?.ubuntuScore ?? 0),
      eventsOrganized,
      followerCount: Number(entity.memberCount ?? 0),
    };
  }

  return { host, reputation };
}
