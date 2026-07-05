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
  getEventReviews,
  getEventRatingStats,
  getHostReputation,
  getReferralLeaderboard,
  getUserReferralCode,
  markReviewHelpful,
} from "@/lib/mongo/engagement";
import { getEventStats } from "@/lib/mongo/stats";
import type {
  EventReviewsResponse,
  EventStats,
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

export async function getUserReferralCodeAction(userId: string): Promise<UserReferralCode | null> {
  return getUserReferralCode(userId);
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
