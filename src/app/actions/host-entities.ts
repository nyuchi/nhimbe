"use server";

/**
 * Host-entity options for the create-event host picker.
 *
 * Replaces the old browser-side Supabase read (`getEntitiesForPerson`): the
 * signed-in person is resolved server-side via AuthKit, then their
 * hosting-capable entities are read from MongoDB (entity.memberships →
 * entity.entities). The browser never touches Mongo.
 */

import { withAuth } from "@workos-inc/authkit-nextjs";
import { personsCollection } from "@/lib/mongo/databases";
import { listHostEntitiesForPerson } from "@/lib/mongo/entities";
import { isDevBypass, DEV_WORKOS_ID } from "@/lib/auth/dev";
import type { EntityType } from "@/lib/mongo/types";

export interface HostEntityOption {
  id: string;
  name: string;
  entityType: EntityType;
  logo: string | null;
  description: string | null;
  verified: boolean;
}

function extractLogo(logo: unknown): string | null {
  if (typeof logo === "string") return logo;
  if (logo && typeof logo === "object") {
    const url = (logo as Record<string, unknown>).url;
    if (typeof url === "string") return url;
  }
  return null;
}

export async function getMyHostEntities(): Promise<HostEntityOption[]> {
  try {
    let workosUserId: string | null = null;
    if (isDevBypass()) {
      workosUserId = DEV_WORKOS_ID;
    } else {
      const { user } = await withAuth();
      workosUserId = user?.id ?? null;
    }
    if (!workosUserId) return [];

    const persons = await personsCollection();
    const person = await persons.findOne({ workosUserId });
    if (!person) return [];

    const entities = await listHostEntitiesForPerson(person._id);
    return entities.map((e) => ({
      id: e._id,
      name: e.name,
      entityType: e.entityType,
      logo: extractLogo(e.logo),
      description: e.description ?? null,
      verified: (e.bundu?.verificationTier ?? 0) >= 2,
    }));
  } catch (err) {
    console.error("[mukoko] getMyHostEntities failed:", err);
    return [];
  }
}
