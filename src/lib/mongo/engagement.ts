/**
 * Engagement reads — the GLOBAL cross-platform substrate.
 *
 * Reviews, ratings and referrals are NOT event-owned: they live in the shared
 * `engagement.*` collections and are keyed by target (referenceType + product /
 * entity id), so the same substrate backs every Mukoko surface. nhimbe reads
 * them target-filtered to events (and to host entities for reputation).
 *
 * Encryption boundary: engagement bodies (review text, headlines, replies) are
 * END-TO-END ENCRYPTED — the platform stores ciphertext it cannot decrypt. The
 * ONLY plaintext fields usable here are the aggregate ones: `reviewRating`
 * (star value) and counts/flags. We NEVER attempt to read a review body.
 *
 * Server-only: pulls the Mongo collection accessors.
 */

import "server-only";
import {
  checkInsCollection,
  eventsCollection,
  personsCollection,
  referralsCollection,
  reviewsCollection,
  rsvpsCollection,
} from "./databases";
import { listHostEntitiesForPerson } from "./entities";
import { newId } from "./ids";
import type { PersonDoc } from "./types";
import { initialsFromName } from "./mappers";
import type {
  EventReview,
  EventReviewsResponse,
  HostStats,
  ReferralLeaderboardEntry,
  ReviewStats,
  UserReferralCode,
} from "@/lib/api";

/** Empty distribution — one bucket per star, 1..5. */
function emptyDistribution(): ReviewStats["distribution"] {
  return { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
}

/**
 * Star aggregate for one event, computed over the shared `engagement.reviews`
 * substrate filtered to this event. Only `reviewRating.ratingValue` (plaintext)
 * is read — the review body stays encrypted and untouched.
 */
export async function getEventRatingStats(eventId: string): Promise<ReviewStats> {
  const reviews = await reviewsCollection();
  const docs = await reviews
    .find(
      { targetReferenceType: "event", targetProductId: eventId, isActive: true },
      { projection: { "reviewRating.ratingValue": 1 } },
    )
    .toArray();

  const distribution = emptyDistribution();
  let sum = 0;
  let count = 0;
  for (const doc of docs) {
    const raw = doc.reviewRating?.ratingValue;
    if (typeof raw !== "number") continue;
    const bucket = Math.round(raw);
    if (bucket < 1 || bucket > 5) continue;
    distribution[bucket as 1 | 2 | 3 | 4 | 5] += 1;
    sum += raw;
    count += 1;
  }

  return {
    averageRating: count > 0 ? Math.round((sum / count) * 10) / 10 : 0,
    totalReviews: count,
    distribution,
  };
}

/**
 * Reviews for an event. E2E was disabled for engagements, so review bodies are
 * now plaintext (`reviewBody`) and readable here. Reads the shared
 * `engagement.reviews` substrate target-filtered to the event, computes the
 * star aggregate over the same docs (no second query), and resolves reviewer
 * display names in one batched persons lookup.
 */
export async function getEventReviews(eventId: string): Promise<EventReviewsResponse> {
  const reviews = await reviewsCollection();
  const docs = await reviews
    .find({
      targetReferenceType: "event",
      targetProductId: eventId,
      isActive: true,
      visibility: "public",
      moderationStatus: { $ne: "removed" },
    })
    .sort({ datePublished: -1, createdAt: -1 })
    .limit(100)
    .toArray();

  // Star aggregate over the same docs.
  const distribution = emptyDistribution();
  let sum = 0;
  let count = 0;
  for (const d of docs) {
    const raw = d.reviewRating?.ratingValue;
    if (typeof raw !== "number") continue;
    const bucket = Math.round(raw);
    if (bucket >= 1 && bucket <= 5) distribution[bucket as 1 | 2 | 3 | 4 | 5] += 1;
    sum += raw;
    count += 1;
  }
  const stats: ReviewStats = {
    averageRating: count > 0 ? Math.round((sum / count) * 10) / 10 : 0,
    totalReviews: count,
    distribution,
  };

  // Batch-resolve reviewer display names.
  const personIds = [...new Set(docs.map((d) => d.reviewerPersonId).filter(Boolean))];
  const persons = personIds.length
    ? await (await personsCollection()).find({ _id: { $in: personIds } }).toArray()
    : [];
  const nameById = new Map(persons.map((p) => [p._id, p.name ?? ""]));

  const mapped: EventReview[] = docs.map((d) => {
    const name = nameById.get(d.reviewerPersonId) || "Member";
    const created = d.datePublished ?? d.createdAt;
    return {
      id: d._id,
      eventId,
      userId: d.reviewerPersonId,
      userName: name,
      userInitials: initialsFromName(name),
      rating: d.reviewRating?.ratingValue ?? 0,
      reviewBody: d.reviewBody ?? undefined,
      helpfulCount: d.helpfulCount ?? 0,
      isVerifiedAttendee: d.verifiedPurchase ?? false,
      dateCreated: created instanceof Date ? created.toISOString() : "",
    };
  });

  return { reviews: mapped, stats };
}

export interface SubmitEventReviewInput {
  eventId: string;
  /** Star value, 1–5. */
  rating: number;
  headline?: string | null;
  body?: string | null;
}

/**
 * Submit (or revise) the acting person's review of an event — the write half
 * of the review system, one review per (person, event), enforced by an upsert
 * keyed on (targetReferenceType, targetProductId, reviewerPersonId).
 *
 * Attendance-gated: the reviewer must hold an RSVP for the event (a check-in
 * additionally marks the review `verifiedPurchase`, surfacing as the
 * "verified attendee" trust dot). Writes the plaintext post-E2E shape that
 * `getEventReviews` reads: `reviewBody`/`reviewHeadline` + `reviewRating`,
 * `visibility: "public"`, `moderationStatus: "unmoderated"`.
 */
export async function submitEventReview(
  person: PersonDoc,
  reviewerEntityId: string,
  input: SubmitEventReviewInput,
): Promise<{ reviewId: string; updated: boolean }> {
  const rating = Math.round(input.rating);
  if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
    throw new Error("A rating between 1 and 5 stars is required.");
  }
  const body = input.body?.trim().slice(0, 4000) || null;
  const headline = input.headline?.trim().slice(0, 200) || null;

  const events = await eventsCollection();
  const event = await events.findOne({ _id: input.eventId });
  if (!event) throw new Error("That event could not be found.");

  // Attendance gate: reviews come from attendees, not passers-by.
  const rsvp = await (await rsvpsCollection()).findOne({
    eventId: input.eventId,
    attendeePersonId: person._id,
  });
  if (!rsvp) throw new Error("Only attendees can review an event — RSVP first.");
  const checkedIn = await (await checkInsCollection()).findOne({
    eventId: input.eventId,
    attendeePersonId: person._id,
  });

  const now = new Date();
  const reviews = await reviewsCollection();
  const key = {
    targetReferenceType: "event" as const,
    targetProductId: input.eventId,
    reviewerPersonId: person._id,
  };
  const result = await reviews.findOneAndUpdate(
    key,
    {
      $set: {
        reviewRating: { ratingValue: rating, bestRating: 5, worstRating: 1 },
        reviewBody: body,
        reviewHeadline: headline,
        verifiedPurchase: checkedIn !== null,
        datePublished: now,
        updatedAt: now,
      },
      $setOnInsert: {
        ...key,
        _id: newId(),
        _schemaVersion: "v3.1",
        reviewerEntityId,
        targetEntityId: event.primaryHostEntityId,
        visibility: "public",
        moderationStatus: "unmoderated",
        isActive: true,
        helpfulCount: 0,
        surfaceContext: "nhimbe",
        media: [],
        createdAt: now,
      },
    },
    { upsert: true, returnDocument: "after" },
  );
  if (!result) throw new Error("Your review could not be saved. Please try again.");
  return { reviewId: result._id, updated: result.createdAt < now };
}

/** Increment a review's plaintext helpful counter (post-E2E). Best-effort. */
export async function markReviewHelpful(reviewId: string): Promise<void> {
  const reviews = await reviewsCollection();
  await reviews.updateOne(
    { _id: reviewId },
    { $inc: { helpfulCount: 1 }, $set: { updatedAt: new Date() } },
  );
}

/**
 * Referral leaderboard for an event.
 *
 * The v3.1 `engagement.referrals` schema has NO event linkage — referrals are
 * keyed by `referralCode` / `referrerPersonId` / `status` and are a global,
 * cross-surface primitive. There is no honest way to scope them to a single
 * event, so we return an empty leaderboard rather than fabricate a filter.
 * Wire this up once the substrate grows an event-scoped referral target.
 */
export async function getReferralLeaderboard(
  _eventId: string,
): Promise<ReferralLeaderboardEntry[]> {
  return [];
}

/**
 * Host reputation for a person, aggregated across the entities they host
 * through. Hosting is entity-centric, so reputation sums over the person's
 * host entities: their star aggregate comes from `engagement.reviews` targeted
 * at those entities, and their hosting volume from `events.events`.
 *
 * `personId` is the `identity.persons._id` (the app user id); we also accept a
 * WorkOS id defensively. Returns null when the person can't be found.
 */
export async function getHostReputation(personId: string): Promise<HostStats | null> {
  const persons = await personsCollection();
  const person = await persons.findOne({
    $or: [{ _id: personId }, { workosUserId: personId }],
  });
  if (!person) return null;

  const hostEntities = await listHostEntitiesForPerson(person._id);
  const hostEntityIds = hostEntities.map((e) => e._id);

  let rating = 0;
  let reviewCount = 0;
  let eventsHosted = 0;
  let totalAttendees = 0;

  if (hostEntityIds.length > 0) {
    const reviews = await reviewsCollection();
    const reviewDocs = await reviews
      .find(
        { targetEntityId: { $in: hostEntityIds }, isActive: true },
        { projection: { "reviewRating.ratingValue": 1 } },
      )
      .toArray();
    let sum = 0;
    for (const doc of reviewDocs) {
      const raw = doc.reviewRating?.ratingValue;
      if (typeof raw !== "number") continue;
      sum += raw;
      reviewCount += 1;
    }
    rating = reviewCount > 0 ? Math.round((sum / reviewCount) * 10) / 10 : 0;

    const events = await eventsCollection();
    const hosted = await events
      .find(
        { primaryHostEntityId: { $in: hostEntityIds } },
        { projection: { totalAttendeeCount: 1 } },
      )
      .toArray();
    eventsHosted = hosted.length;
    totalAttendees = hosted.reduce((acc, e) => acc + (e.totalAttendeeCount ?? 0), 0);
  }

  const avgAttendance = eventsHosted > 0 ? Math.round(totalAttendees / eventsHosted) : 0;
  const name = person.name ?? "";

  return {
    userId: person._id,
    name,
    handle: person.preferredUsername ?? person.nickname ?? undefined,
    initials: initialsFromName(name),
    eventsHosted,
    totalAttendees,
    avgAttendance,
    rating,
    reviewCount,
    badges: [],
  };
}

/**
 * A person's existing referral code, read from the shared `engagement.referrals`
 * substrate by `referrerPersonId`. Referrals are global (not event-scoped), so
 * this returns the person's most recent code plus their lifetime referral /
 * conversion totals. Returns null when the person has no referral on record —
 * we do NOT mint one here (see the generate path, which can't safely fabricate
 * the validator-required `referrerEntityId`).
 */
export async function getUserReferralCode(personId: string): Promise<UserReferralCode | null> {
  const referrals = await referralsCollection();
  const docs = await referrals
    .find({ referrerPersonId: personId })
    .sort({ createdAt: -1 })
    .toArray();
  if (docs.length === 0) return null;

  const totalReferrals = docs.length;
  const totalConversions = docs.filter(
    (d) => d.status === "converted" || d.status === "completed",
  ).length;

  return {
    code: docs[0].referralCode,
    totalReferrals,
    totalConversions,
  };
}
