/**
 * User feedback / error reports — nhimbe-owned `system.feedback` collection.
 *
 * There was no way for users to report a bug or send an idea. This is the
 * write side: a plain document per submission (`system` db, nhimbe-owned config
 * space alongside `system.platformSettings`). The shape is defined here — it is
 * not a shared Mukoko substrate.
 *
 * **Never-throw.** Persisting feedback must never break the request that
 * triggered it (the same contract as `src/lib/email/resend.ts`). A missing
 * connection, a write failure, or a validator rejection (if the cluster grows a
 * JSON-Schema validator for this collection) is caught, `[mukoko:feedback]`
 * logged, and reported as `{ stored: false }` so the caller can fall back to
 * emailing the report instead.
 */

import "server-only";
import { getCollection, DB } from "./databases";
import { WRITE_SCHEMA_VERSION, newId } from "./ids";
import { createLogger } from "@/lib/observability";
import type { BaseDoc } from "./types";

const feedbackLog = createLogger("feedback");

/** Feedback category — a small closed set the form offers. */
export type FeedbackCategory = "bug" | "idea" | "other";

export const FEEDBACK_CATEGORIES: readonly FeedbackCategory[] = ["bug", "idea", "other"] as const;

/** Coerce an untrusted value onto a known category (defaults to `other`). */
export function normalizeFeedbackCategory(value: unknown): FeedbackCategory {
  return FEEDBACK_CATEGORIES.includes(value as FeedbackCategory)
    ? (value as FeedbackCategory)
    : "other";
}

/** A recorded feedback submission. */
export interface FeedbackDoc extends BaseDoc {
  category: FeedbackCategory;
  /** The free-text body the user wrote. */
  message: string;
  /** Path the user was on when reporting (auto-captured). */
  path?: string;
  /** Browser user-agent (auto-captured client-side). */
  userAgent?: string;
  /** Next.js error digest, when opened from an error boundary. */
  errorDigest?: string;
  /** Acting person id when signed in. */
  personId?: string;
  /** Contact email — the person's email when signed in, else the supplied one. */
  contactEmail?: string;
  /** `true` when the reporter was signed in. */
  authenticated: boolean;
  /** Triage status; new rows start `open`. */
  status: "open";
}

/** Normalised, server-trusted feedback input (already validated by the action). */
export interface FeedbackRecord {
  category: FeedbackCategory;
  message: string;
  path?: string;
  userAgent?: string;
  errorDigest?: string;
  personId?: string;
  contactEmail?: string;
  authenticated: boolean;
}

const feedbackCollection = () => getCollection<FeedbackDoc>(DB.system, "feedback");

/**
 * Persist one feedback submission to `system.feedback`. Best-effort and
 * never-throw: returns the new `_id` on success, or `{ stored: false }` with
 * the reason logged so the caller can decide whether email is enough.
 */
export async function recordFeedback(
  record: FeedbackRecord,
): Promise<{ stored: boolean; id?: string; error?: string }> {
  const now = new Date();
  const id = newId();
  const doc: FeedbackDoc = {
    _id: id,
    _schemaVersion: WRITE_SCHEMA_VERSION,
    createdAt: now,
    updatedAt: now,
    category: record.category,
    message: record.message,
    authenticated: record.authenticated,
    status: "open",
    ...(record.path ? { path: record.path } : {}),
    ...(record.userAgent ? { userAgent: record.userAgent } : {}),
    ...(record.errorDigest ? { errorDigest: record.errorDigest } : {}),
    ...(record.personId ? { personId: record.personId } : {}),
    ...(record.contactEmail ? { contactEmail: record.contactEmail } : {}),
  };

  try {
    const col = await feedbackCollection();
    await col.insertOne(doc);
    feedbackLog.info("Feedback stored", { data: { id, category: record.category } });
    return { stored: true, id };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    feedbackLog.error("Failed to store feedback", {
      error: error instanceof Error ? error : new Error(message),
    });
    return { stored: false, error: message };
  }
}
