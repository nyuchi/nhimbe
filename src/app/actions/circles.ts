"use server";

/**
 * Circles read server actions (Vercel server runtime → MongoDB).
 *
 * `getMyCircles` replaces the browser-side Supabase read
 * (`getCirclesForPerson`) on the /circles index. Circles are private to their
 * members, so the acting person is resolved server-side from the WorkOS
 * session (via AuthKit's `withAuth()`) or the local dev bypass — the browser
 * never passes a person id and never touches MongoDB directly.
 *
 * Mukoko v3.1 model: a person's circles are found via
 * `circles.memberships` (memberPersonId → circleId, active rows only), then
 * the matching `circles.circles` documents are loaded and mapped to the small
 * UI shape the index card needs.
 */

import { withAuth } from "@workos-inc/authkit-nextjs";
import { circleMembershipsCollection, circlesCollection } from "@/lib/mongo/databases";
import { getPersonByWorkosId } from "@/lib/mongo/users";
import { isDevBypass, DEV_WORKOS_ID } from "@/lib/auth/dev";
import type { CircleDoc } from "@/lib/mongo/types";

/** Minimal circle shape the index list renders. */
export interface CircleSummary {
  id: string;
  name: string;
  description: string | null;
  circle_purpose: string;
  member_count: number;
  linked_event_id: string | null;
}

function mapCircleDocToSummary(doc: CircleDoc): CircleSummary {
  return {
    id: doc._id,
    name: doc.name,
    description: doc.description ?? null,
    // The legacy Supabase shape exposed a free-text `circle_purpose`; the v3.1
    // doc has no direct equivalent, so fall back to the circle type as the
    // human-readable purpose the card shows when there's no description.
    circle_purpose: doc.circleType ?? "",
    member_count: doc.memberCount ?? 0,
    linked_event_id: doc.primaryEventId ?? null,
  };
}

/**
 * Return the circles the signed-in person actively belongs to. Returns an empty
 * array when there's no session (the index treats this as "sign in to see your
 * circles") or when the person isn't a member of any circle yet.
 */
export async function getMyCircles(): Promise<CircleSummary[]> {
  // Resolve the acting WorkOS id: live session, or the local dev bypass.
  let workosUserId: string | null = null;
  if (isDevBypass()) {
    workosUserId = DEV_WORKOS_ID;
  } else {
    const { user } = await withAuth();
    workosUserId = user?.id ?? null;
  }
  if (!workosUserId) return [];

  const person = await getPersonByWorkosId(workosUserId);
  if (!person) return [];

  // Active memberships → circle ids.
  const memberships = await circleMembershipsCollection();
  const membershipRows = await memberships
    .find({ memberPersonId: person.personId, isActive: true })
    .project<{ circleId: string }>({ circleId: 1, _id: 0 })
    .toArray();

  const circleIds = membershipRows.map((m) => m.circleId);
  if (circleIds.length === 0) return [];

  // Load the matching circle docs.
  const circles = await circlesCollection();
  const docs = await circles.find({ _id: { $in: circleIds } }).toArray();

  return docs.map(mapCircleDocToSummary);
}
