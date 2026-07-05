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
  eventsCollection,
  personsCollection,
  referralsCollection,
  reviewsCollection,
} from "./databases";
import { listHostEntitiesForPerson } from "./entities";
import { initialsFromName } from "./mappers";
import type {
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
 * Reviews for an event. Bodies are E2E-encrypted, so the `reviews` array is
 * always empty for now — only the star aggregate (`stats`) is readable. When a
 * client-side decryption path lands, hydrate `reviews` there, not here.
 */
export async function getEventReviews(eventId: string): Promise<EventReviewsResponse> {
  return {
    reviews: [],
    stats: await getEventRatingStats(eventId),
  };
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
