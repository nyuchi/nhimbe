/**
 * Public circle reads (server-only).
 *
 * A circle is a COMMUNITY — a schema.org OnlineCommunityGroup living in
 * `circles.circles` (members, posts feed, optional paired chat), not an event
 * calendar. These reads power public browse surfaces (/discover "featured
 * circles"): they list discoverable circles only — `secret` circles never
 * appear, and membership-gated content (posts, members) stays behind the
 * session-scoped server actions in `src/app/actions/circle*`.
 */

import "server-only";
import { circlesCollection } from "./databases";
import type { CircleDoc } from "./types";

export type CircleJoinPolicy = "public" | "private" | "broadcast";

/** The small shape browse surfaces render for a circle. */
export interface FeaturedCircle {
  id: string;
  name: string;
  description: string | null;
  /**
   * Drives the join affordance: public → "Join", private → "Request to
   * join", broadcast → "Follow".
   */
  circleType: CircleJoinPolicy;
  memberCount: number;
  postCount: number;
}

function isDiscoverable(t: CircleDoc["circleType"]): t is CircleJoinPolicy {
  return t === "public" || t === "private" || t === "broadcast";
}

/**
 * Tiny id→name resolve for provenance links (e.g. a calendar's
 * "from <circle>" line). Secret circles are never named to outsiders.
 */
export async function getCircleSummary(
  circleId: string,
): Promise<{ id: string; name: string } | null> {
  const col = await circlesCollection();
  const doc = await col.findOne(
    { _id: circleId, isActive: true, circleType: { $in: ["public", "private", "broadcast"] } },
    { projection: { name: 1 } },
  );
  return doc ? { id: doc._id, name: doc.name } : null;
}

/** The small shape a "my circles" picker (e.g. calendar creation) renders. */
export interface OwnedCircle {
  id: string;
  name: string;
}

/**
 * Circles a person owns — used to restrict which circle a calendar can be
 * attached to at creation (a calendar may only attach to a circle its
 * creator owns). Includes secret circles since this is an owner-scoped read,
 * not a discovery surface.
 */
export async function listCirclesByOwner(ownerPersonId: string): Promise<OwnedCircle[]> {
  const col = await circlesCollection();
  const docs = await col
    .find({ ownerPersonId, isActive: true })
    .sort({ name: 1 })
    .project<{ _id: string; name: string }>({ name: 1 })
    .toArray();
  return docs.map((d) => ({ id: d._id, name: d.name }));
}

/**
 * The most active discoverable circles (by members, then posts). Secret
 * circles are excluded at the query, never just at the mapper.
 */
export async function listFeaturedCircles(limit = 6): Promise<FeaturedCircle[]> {
  const col = await circlesCollection();
  const docs = await col
    .find({ isActive: true, circleType: { $in: ["public", "private", "broadcast"] } })
    .sort({ memberCount: -1, postCount: -1 })
    .limit(limit)
    .toArray();

  return docs
    .filter((d) => isDiscoverable(d.circleType))
    .map((d) => ({
      id: d._id,
      name: d.name,
      description: d.description ?? null,
      circleType: d.circleType as CircleJoinPolicy,
      memberCount: d.memberCount ?? 0,
      postCount: d.postCount ?? 0,
    }));
}
