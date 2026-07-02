"use server";

/**
 * Kraal (circle) detail server actions — Vercel server runtime → MongoDB.
 *
 * Replaces the browser-side Supabase helpers the kraal detail page used to call
 * (`getCircle` / `getCirclePosts` / `getCircleMembers` / `createCirclePost` /
 * `joinCircle` / `togglePostReaction`). The browser can't talk to Mongo, so all
 * reads and writes now run here against the `circles` database via the shared
 * accessors in `@/lib/mongo/databases`.
 *
 * Writes resolve the acting person from the AuthKit session (or the local dev
 * bypass) server-side — the client never gets to assert who it is. Reactions
 * are tracked per-person on the post document itself (the v3.1 model has no
 * separate per-user reaction collection), which keeps the toggle honest while
 * staying inside the collections this sweep is allowed to touch.
 */

import { withAuth } from "@workos-inc/authkit-nextjs";
import {
  circleMembershipsCollection,
  circlePostsCollection,
  circlesCollection,
  personsCollection,
} from "@/lib/mongo/databases";
import { stampNew } from "@/lib/mongo/ids";
import { ensureHostEntityForPerson } from "@/lib/mongo/entities";
import { syncPersonFromWorkos, type SyncPersonInput } from "@/lib/mongo/users";
import { isDevBypass, DEV_WORKOS_ID, DEV_EMAIL, DEV_NAME } from "@/lib/auth/dev";
import type {
  CircleDoc,
  CircleMembershipDoc,
  CirclePostDoc,
  PersonDoc,
} from "@/lib/mongo/types";

const MAX_POST_LENGTH = 5000;

// ── API shapes (kept compatible with the old Supabase helpers) ──────────────

/** Minimal person projection the kraal UI renders for authors and members. */
export interface KraalPerson {
  id: string;
  name: string | null;
  givenname: string | null;
  familyname: string | null;
  image: string | null;
}

/** Circle shape the detail page consumes (snake_case, matching the old row). */
export interface KraalCircle {
  id: string;
  name: string;
  description: string | null;
  circle_purpose: string;
  member_count: number | null;
  post_count: number | null;
  linked_event_id: string | null;
}

/** Post shape the detail stream/archive renders. */
export interface KraalPost {
  id: string;
  circle_id: string;
  author_id: string;
  text: string | null;
  post_type: string | null;
  like_count: number | null;
  comment_count: number | null;
  moderation_status: string | null;
  created_at: string | null;
  author: KraalPerson | null;
}

/** Membership shape the members tab renders. */
export interface KraalMember {
  circle_id: string;
  person_id: string;
  role: string;
  status: string;
  joined_at: string | null;
  person: KraalPerson | null;
}

// ── Mappers ─────────────────────────────────────────────────────────────────

function mapPerson(doc: PersonDoc): KraalPerson {
  return {
    id: doc._id,
    name: doc.name ?? null,
    givenname: doc.givenName ?? null,
    familyname: doc.familyName ?? null,
    image: doc.picture ?? null,
  };
}

function mapCircle(doc: CircleDoc): KraalCircle {
  return {
    id: doc._id,
    name: doc.name,
    description: doc.description ?? null,
    // The v3.1 circle has no distinct "purpose" field; surface the description
    // so the hero's `description || circle_purpose` fallback still renders.
    circle_purpose: doc.description ?? "",
    member_count: doc.memberCount ?? null,
    post_count: doc.postCount ?? null,
    linked_event_id: doc.primaryEventId ?? null,
  };
}

function mapPost(doc: CirclePostDoc, author: KraalPerson | null): KraalPost {
  return {
    id: doc._id,
    circle_id: doc.circleId,
    author_id: doc.authorPersonId,
    text: doc.articleBody ?? null,
    post_type: doc.postType ?? null,
    like_count: doc.reactionCount ?? 0,
    comment_count: doc.commentCount ?? 0,
    moderation_status: doc.moderationStatus ?? null,
    created_at: (doc.datePublished ?? doc.createdAt)?.toISOString() ?? null,
    author,
  };
}

/** Resolve a batch of persons keyed by `_id` for author/member hydration. */
async function hydratePersons(ids: string[]): Promise<Map<string, KraalPerson>> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return new Map();
  const persons = await personsCollection();
  const docs = await persons.find({ _id: { $in: unique } }).toArray();
  return new Map(docs.map((d) => [d._id, mapPerson(d)]));
}

// ── Acting-person resolution (writes only) ──────────────────────────────────

/** Resolve the signed-in person doc, syncing it on first use. Throws when
 *  there is no session and the dev bypass is off. */
async function resolveActingPerson(): Promise<PersonDoc> {
  let syncInput: SyncPersonInput;
  if (isDevBypass()) {
    syncInput = { workosUserId: DEV_WORKOS_ID, email: DEV_EMAIL, name: DEV_NAME, emailVerified: true };
  } else {
    const { user } = await withAuth();
    if (!user) throw new Error("You must be signed in to do that.");
    syncInput = {
      workosUserId: user.id,
      email: user.email ?? null,
      name: [user.firstName, user.lastName].filter(Boolean).join(" ").trim() || null,
      givenName: user.firstName ?? null,
      familyName: user.lastName ?? null,
      picture: user.profilePictureUrl ?? null,
      emailVerified: user.emailVerified ?? undefined,
    };
  }

  const persons = await personsCollection();
  let person = await persons.findOne({ workosUserId: syncInput.workosUserId });
  if (!person) {
    await syncPersonFromWorkos(syncInput);
    person = await persons.findOne({ workosUserId: syncInput.workosUserId });
  }
  if (!person) throw new Error("Could not resolve your account. Please try again.");
  return person;
}

// ── Reads ───────────────────────────────────────────────────────────────────

export async function getCircle(circleId: string): Promise<KraalCircle | null> {
  try {
    const circles = await circlesCollection();
    const doc = await circles.findOne({ _id: circleId, isActive: true });
    return doc ? mapCircle(doc) : null;
  } catch (err) {
    console.warn("[mukoko] getCircle failed:", err);
    return null;
  }
}

export async function getCirclePosts(
  circleId: string,
  limit = 20,
  archived = false,
): Promise<KraalPost[]> {
  try {
    const posts = await circlePostsCollection();
    const moderationStatus: CirclePostDoc["moderationStatus"] | { $ne: CirclePostDoc["moderationStatus"] } =
      archived ? "removed" : { $ne: "removed" };
    const docs = await posts
      .find({ circleId, moderationStatus })
      .sort({ datePublished: -1, createdAt: -1 })
      .limit(limit)
      .toArray();
    const byId = await hydratePersons(docs.map((d) => d.authorPersonId));
    return docs.map((d) => mapPost(d, byId.get(d.authorPersonId) ?? null));
  } catch (err) {
    console.warn("[mukoko] getCirclePosts failed:", err);
    return [];
  }
}

export async function getCircleMembers(circleId: string, limit = 50): Promise<KraalMember[]> {
  try {
    const memberships = await circleMembershipsCollection();
    const docs = await memberships
      .find({ circleId, membershipStatus: "active" })
      .sort({ joinedAt: 1 })
      .limit(limit)
      .toArray();
    const byId = await hydratePersons(docs.map((d) => d.memberPersonId));
    return docs.map((d) => ({
      circle_id: d.circleId,
      person_id: d.memberPersonId,
      role: d.role,
      status: d.membershipStatus,
      joined_at: d.joinedAt?.toISOString() ?? null,
      person: byId.get(d.memberPersonId) ?? null,
    }));
  } catch (err) {
    console.warn("[mukoko] getCircleMembers failed:", err);
    return [];
  }
}

// ── Writes ──────────────────────────────────────────────────────────────────

export async function createCirclePost(input: {
  circleId: string;
  text: string;
  postType?: string;
}): Promise<KraalPost> {
  const text = input.text?.trim() ?? "";
  if (!text) throw new Error("Write something before posting.");
  if (text.length > MAX_POST_LENGTH) {
    throw new Error(`Posts must be ${MAX_POST_LENGTH} characters or fewer.`);
  }

  const person = await resolveActingPerson();
  const authorEntityId = await ensureHostEntityForPerson(person);
  const now = new Date();

  const doc: CirclePostDoc = {
    ...stampNew(),
    circleId: input.circleId,
    authorPersonId: person._id,
    authorEntityId,
    schemaOrgType: "SocialMediaPosting",
    postType: input.postType ?? "text",
    inLanguage: "en",
    moderationStatus: "approved",
    isPinned: false,
    visibility: "circle_members",
    commentCount: 0,
    reactionCount: 0,
    viewCount: 0,
    datePublished: now,
    articleBody: text,
  } as CirclePostDoc;

  const posts = await circlePostsCollection();
  await posts.insertOne(doc);

  // Keep the circle's denormalised post count moving.
  const circles = await circlesCollection();
  await circles.updateOne(
    { _id: input.circleId },
    { $inc: { postCount: 1 }, $set: { updatedAt: now } },
  );

  return mapPost(doc, mapPerson(person));
}

export async function joinCircle(input: { circleId: string }): Promise<void> {
  const person = await resolveActingPerson();
  const memberEntityId = await ensureHostEntityForPerson(person);
  const now = new Date();

  const memberships = await circleMembershipsCollection();
  const existing = await memberships.findOne({
    circleId: input.circleId,
    memberPersonId: person._id,
  });

  if (existing) {
    // Re-activate a prior membership (left/removed) instead of duplicating.
    if (existing.membershipStatus !== "active") {
      await memberships.updateOne(
        { _id: existing._id },
        {
          $set: {
            membershipStatus: "active",
            isActive: true,
            joinedAt: now,
            updatedAt: now,
            leftAt: null,
          },
        },
      );
      await bumpMemberCount(input.circleId, 1, now);
    }
    return;
  }

  const doc: CircleMembershipDoc = {
    ...stampNew(),
    circleId: input.circleId,
    memberPersonId: person._id,
    memberEntityId,
    role: "member",
    membershipStatus: "active",
    isActive: true,
    joinedAt: now,
  } as CircleMembershipDoc;
  await memberships.insertOne(doc);
  await bumpMemberCount(input.circleId, 1, now);
}

async function bumpMemberCount(circleId: string, delta: number, now: Date): Promise<void> {
  const circles = await circlesCollection();
  await circles.updateOne(
    { _id: circleId },
    { $inc: { memberCount: delta }, $set: { updatedAt: now } },
  );
}

/**
 * Toggle the acting person's reaction on a post. The v3.1 model has no separate
 * per-user reaction collection, so reactors are tracked in a `reactorPersonIds`
 * array on the post doc and `reactionCount` is kept in sync. Returns whether the
 * reaction was added or removed so the client can adjust its optimistic count.
 */
export async function togglePostReaction(input: {
  postId: string;
}): Promise<"added" | "removed"> {
  const person = await resolveActingPerson();
  const posts = await circlePostsCollection();
  const now = new Date();

  // `reactorPersonIds` is an extra field beyond the canonical CirclePostDoc; the
  // validators allow extra fields. Query/update it via a loosened filter.
  const already = await posts.findOne({
    _id: input.postId,
    reactorPersonIds: person._id,
  } as Record<string, unknown>);

  if (already) {
    await posts.updateOne(
      { _id: input.postId },
      {
        $pull: { reactorPersonIds: person._id },
        $inc: { reactionCount: -1 },
        $set: { updatedAt: now },
      } as Record<string, unknown>,
    );
    return "removed";
  }

  await posts.updateOne(
    { _id: input.postId },
    {
      $addToSet: { reactorPersonIds: person._id },
      $inc: { reactionCount: 1 },
      $set: { updatedAt: now },
    } as Record<string, unknown>,
  );
  return "added";
}
