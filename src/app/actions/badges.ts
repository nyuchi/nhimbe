"use server";

/**
 * Profile badge reads (Vercel server runtime → MongoDB).
 *
 * Replaces the old direct-Supabase read of `ubuntu.user_badges` + `ubuntu.badges`
 * from the browser. The Mukoko v3.1 model keeps the same concept under the
 * `ubuntu` database but with renamed collections/fields:
 *
 *   ubuntu.badges(_id, slug, name, description, iconUri, badgeType,
 *                 category, rarity, isActive, ...)
 *   ubuntu.badgeAwards(_id, badgeId, holderPersonId, holderEntityId,
 *                      awardedMethod, isVisible, awardedAt, revokedAt, ...)
 *
 * The browser never touches Mongo — the `profile-badges` client component calls
 * this server action, which resolves the acting person (AuthKit or the local dev
 * bypass) and fans out across the two `ubuntu` collections.
 *
 * Both collections live on the cluster but are not part of the typed accessor
 * map in `@/lib/mongo/databases` (they're an Ubuntu-domain concern, not an
 * events concern), so we reach them through the shared `getMongoClient`. If the
 * `ubuntu` database or either collection is absent — or simply empty, which is
 * the case today — this returns `[]` so the surface degrades to "nothing to
 * show" rather than erroring. See the `notes` in the action result.
 */

import { withAuth } from "@workos-inc/authkit-nextjs";
import type { Document } from "mongodb";
import { getMongoClient } from "@/lib/mongo";
import { isDevBypass } from "@/lib/auth/dev";

/** v3.1 `ubuntu.badges` definition document (only the fields we render). */
interface BadgeDoc extends Document {
  _id: string;
  name: string;
  description?: string | null;
  iconUri?: string | null;
  badgeType?: string | null;
  rarity?: string | null;
  isActive?: boolean;
}

/** v3.1 `ubuntu.badgeAwards` junction document (only the fields we render). */
interface BadgeAwardDoc extends Document {
  _id: string;
  badgeId: string;
  holderPersonId: string;
  awardedAt?: Date | string | null;
  isVisible?: boolean;
  revokedAt?: Date | string | null;
}

/**
 * API shape the `profile-badges` component renders. Snake-case-free, schema.org
 * aligned: a badge definition plus, when earned, the award metadata.
 */
export interface ProfileBadge {
  /** Badge definition id (`ubuntu.badges._id`). */
  id: string;
  name: string;
  description: string | null;
  /** Icon glyph/emoji or URI; the component renders the raw value. */
  icon: string | null;
  badgeType: string | null;
  rarity: string | null;
  /** Present when this person has earned the badge. */
  earned?: {
    /** ISO 8601 instant the badge was awarded. */
    awardedAt: string;
  };
}

export interface ProfileBadgesResult {
  badges: ProfileBadge[];
  /** Set when the result is empty for a structural reason (absent collections). */
  note?: string;
}

const DB_NAME = "ubuntu";
const BADGES_COLLECTION = "badges";
const AWARDS_COLLECTION = "badgeAwards";
const MAX_LOCKED_SHOWN = 4;

/**
 * Resolve earned + locked badges for a person.
 *
 * `personId` is the `identity.persons._id` (the OIDC `sub`), which is what
 * `ubuntu.badgeAwards.holderPersonId` references. We require a signed-in caller
 * (or the dev bypass) so unauthenticated traffic can't enumerate badges, but the
 * profile surface itself is allowed to read any person's public badges.
 */
export async function getProfileBadges(personId: string): Promise<ProfileBadgesResult> {
  if (!personId) return { badges: [] };

  // Gate on an acting identity. The profile page only renders this for a
  // resolved person, but server actions are network-callable on their own.
  if (!isDevBypass()) {
    const { user } = await withAuth();
    if (!user) return { badges: [], note: "Not signed in." };
  }

  const client = await getMongoClient();
  const db = client.db(DB_NAME);

  // Confirm both collections exist before querying. They live on the cluster in
  // the v3.1 model but may be absent in a partially-seeded environment.
  const present = new Set(
    (await db.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name),
  );
  if (!present.has(BADGES_COLLECTION) || !present.has(AWARDS_COLLECTION)) {
    return {
      badges: [],
      note: `ubuntu.${BADGES_COLLECTION}/${AWARDS_COLLECTION} not present — no badges.`,
    };
  }

  const awardsCol = db.collection<BadgeAwardDoc>(AWARDS_COLLECTION);
  const badgesCol = db.collection<BadgeDoc>(BADGES_COLLECTION);

  // Earned, non-revoked, visible awards for this person.
  const awards = await awardsCol
    .find({ holderPersonId: personId, isVisible: { $ne: false }, revokedAt: null })
    .toArray();
  const earnedIds = new Set(awards.map((a) => a.badgeId));

  // Pull the matching definitions plus a tail of active, not-yet-earned badges
  // so the surface always says "there's more to earn".
  const defs = await badgesCol.find({ isActive: { $ne: false } }).limit(80).toArray();
  const defById = new Map(defs.map((d) => [d._id, d] as const));

  const toApi = (def: BadgeDoc, award?: BadgeAwardDoc): ProfileBadge => ({
    id: def._id,
    name: def.name,
    description: def.description ?? null,
    icon: def.iconUri ?? null,
    badgeType: def.badgeType ?? null,
    rarity: def.rarity ?? null,
    earned: award ? { awardedAt: toIso(award.awardedAt) } : undefined,
  });

  const earned: ProfileBadge[] = awards.flatMap((a) => {
    const def = defById.get(a.badgeId);
    return def ? [toApi(def, a)] : [];
  });
  // Shiniest (most recent) first.
  earned.sort((a, b) => +new Date(b.earned!.awardedAt) - +new Date(a.earned!.awardedAt));

  const locked: ProfileBadge[] = defs
    .filter((d) => !earnedIds.has(d._id))
    .slice(0, MAX_LOCKED_SHOWN)
    .map((d) => toApi(d));

  return { badges: [...earned, ...locked] };
}

/** Coerce a Mongo date (Date or ISO string) to an ISO string; epoch on miss. */
function toIso(value: Date | string | null | undefined): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") {
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }
  return new Date(0).toISOString();
}
