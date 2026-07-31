"use server";

/**
 * Engagement / stats read server actions (Vercel server runtime → MongoDB).
 *
 * These replace the worker-era `@/lib/api` fetches to `/api/events/:id/reviews`,
 * `/stats`, `/referrals`, `/api/users/:id/reputation` and the referral-code
 * endpoints — all now 404. Engagement is a GLOBAL cross-platform substrate, so
 * the reads target the shared `engagement.*` collections (target-filtered to
 * events / host entities). Return shapes match the old `@/lib/api` helpers so
 * call sites swap the import and `await` the action — no UI change.
 *
 * Some writes the components still call are blocked by the v3.1 E2E-encrypted /
 * entity-centric schema; those actions are graceful no-ops (documented below)
 * rather than fabricating fields the validators require.
 */

import {
  getEntityReviews,
  getEventReviews,
  getEventRatingStats,
  getHostReputation,
  getReferralLeaderboard,
  getUserReferralCode,
  markReviewHelpful,
  submitEventReview,
} from "@/lib/mongo/engagement";
import { requireActingPerson } from "@/lib/auth/current-person";
import { ensureHostEntityForPerson } from "@/lib/mongo/entities";
import { getEventStats } from "@/lib/mongo/stats";
import type {
  EventReviewsResponse,
  EventStats,
  HostReviewsResponse,
  HostStats,
  ReferralLeaderboardEntry,
  ReviewStats,
  UserReferralCode,
} from "@/lib/api";

// ── reads ────────────────────────────────────────────────────────────

export async function getEventReviewsAction(eventId: string): Promise<EventReviewsResponse> {
  return getEventReviews(eventId);
}

export async function getEventRatingStatsAction(eventId: string): Promise<ReviewStats> {
  return getEventRatingStats(eventId);
}

export async function getEventStatsAction(eventId: string): Promise<EventStats> {
  return getEventStats(eventId);
}

export async function getEventReferralLeaderboardAction(
  eventId: string,
): Promise<ReferralLeaderboardEntry[]> {
  return getReferralLeaderboard(eventId);
}

export async function getHostReputationAction(userId: string): Promise<HostStats | null> {
  return getHostReputation(userId);
}

/** Reviews written about a host entity, across every event it has run. */
export async function getEntityReviewsAction(entityId: string): Promise<HostReviewsResponse> {
  return getEntityReviews(entityId);
}

export async function getUserReferralCodeAction(userId: string): Promise<UserReferralCode | null> {
  return getUserReferralCode(userId);
}

// ── writes ───────────────────────────────────────────────────────────

export interface SubmitEventReviewActionInput {
  eventId: string;
  rating: number;
  headline?: string;
  body?: string;
}

/**
 * Submit (or revise) the signed-in attendee's review of an event. Runtime
 * input validation mirrors the admin-action convention (types are erased at
 * runtime); the mongo layer enforces the attendance gate and the one-review-
 * per-person upsert.
 */
export async function submitEventReviewAction(
  input: SubmitEventReviewActionInput,
): Promise<{ reviewId: string }> {
  const eventId = typeof input?.eventId === "string" ? input.eventId.trim() : "";
  if (!eventId) throw new Error("An event id is required.");
  const rating = Number(input?.rating);

  const person = await requireActingPerson("You must be signed in to review an event.");
  const reviewerEntityId = await ensureHostEntityForPerson(person);

  const { reviewId } = await submitEventReview(person, reviewerEntityId, {
    eventId,
    rating,
    headline: typeof input?.headline === "string" ? input.headline : null,
    body: typeof input?.body === "string" ? input.body : null,
  });
  return { reviewId };
}

// ── writes (graceful stubs) ──────────────────────────────────────────

/**
 * Mark a review "helpful" — now that E2E is disabled on engagements, the review
 * carries a plaintext `helpfulCount` we can increment. Best-effort.
 */
export async function markReviewHelpfulAction(reviewId: string): Promise<{ message: string }> {
  try {
    await markReviewHelpful(reviewId);
  } catch {
    // Best-effort; the component keeps its optimistic UI regardless.
  }
  return { message: "ok" };
}

/**
 * Generating a referral code is not safely possible here: inserting into
 * `engagement.referrals` requires a `referrerEntityId` (the entity the person
 * refers through) and a `surfaceContext` that we can't fabricate without an
 * entity-resolution + write path. Rather than write a malformed document, we
 * return the person's existing code if one is already on record, else a stable
 * empty-code shape so the caller's UI degrades gracefully.
 */
export async function generateUserReferralCodeAction(userId: string): Promise<{ code: string }> {
  const existing = await getUserReferralCode(userId);
  return { code: existing?.code ?? "" };
}
