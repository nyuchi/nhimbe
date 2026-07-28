"use server";

/**
 * Feedback / error-report server action — Vercel server runtime.
 *
 * There is no other way for a user to tell us something is broken. This action
 * takes a short report (message + category, plus auto-captured context) and does
 * two best-effort, **never-throw** things after validating input:
 *   1. records it to `system.feedback` (`recordFeedback`, swallows failures), and
 *   2. emails it to the support inbox via Resend (`sendEmail`, already never-throw).
 *
 * The action succeeds if *either* sink accepts it — so a missing Mongo cluster
 * or a validator rejection still gets the report to a human by email, and a
 * missing `RESEND_API_KEY` still stores it. It only reports failure when both
 * sinks are unavailable, and never throws (a broken feedback path must not be
 * the user's second error of the day).
 *
 * The acting person id + email are attached when signed in (`resolveActingPerson`);
 * signed-out reporters may supply a contact email.
 */

import { resolveActingPerson } from "@/lib/auth/current-person";
import {
  recordFeedback,
  normalizeFeedbackCategory,
  type FeedbackCategory,
} from "@/lib/mongo/feedback";
import { sendEmail } from "@/lib/email/resend";
import { feedbackReceived } from "@/lib/email/templates";
import { createLogger } from "@/lib/observability";

const feedbackLog = createLogger("feedback");

/** Where feedback emails land. Overridable per environment. */
const FEEDBACK_INBOX = process.env.FEEDBACK_INBOX || "support@mukoko.com";

const MESSAGE_MAX = 5000;
const FIELD_MAX = 1000;

export interface FeedbackInput {
  message: string;
  category: FeedbackCategory | string;
  /** Contact email for signed-out reporters (ignored when signed in). */
  email?: string;
  /** Path the user was on (auto-captured client-side). */
  path?: string;
  /** Browser user-agent (auto-captured client-side). */
  userAgent?: string;
  /** Next.js error digest when opened from an error boundary. */
  errorDigest?: string;
}

export interface FeedbackResult {
  success: boolean;
  error?: string;
}

/** Trim + clamp an untrusted string to `max` chars; returns undefined when empty. */
function clampOptional(value: unknown, max: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim().slice(0, max);
  return trimmed || undefined;
}

/** Very light email shape check — we never send TO this address, only reply-to. */
function normalizeEmail(value: unknown): string | undefined {
  const email = clampOptional(value, 320);
  if (!email) return undefined;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : undefined;
}

export async function submitFeedback(input: FeedbackInput): Promise<FeedbackResult> {
  try {
    const message = typeof input.message === "string" ? input.message.trim().slice(0, MESSAGE_MAX) : "";
    if (!message) {
      return { success: false, error: "Please enter a message." };
    }

    const category = normalizeFeedbackCategory(input.category);
    const path = clampOptional(input.path, FIELD_MAX);
    const userAgent = clampOptional(input.userAgent, FIELD_MAX);
    const errorDigest = clampOptional(input.errorDigest, FIELD_MAX);

    // Who is reporting? Resolve the person defensively — a resolver failure must
    // not sink the report (the whole point is that something is already broken).
    let personId: string | undefined;
    let personEmail: string | undefined;
    let personName: string | undefined;
    try {
      const person = await resolveActingPerson();
      if (person) {
        personId = person._id;
        personEmail = person.email ?? undefined;
        personName = person.name ?? undefined;
      }
    } catch (error) {
      feedbackLog.warn("Could not resolve acting person for feedback", {
        error: error instanceof Error ? error : new Error(String(error)),
      });
    }

    const authenticated = Boolean(personId);
    // Signed-in reporters use their account email; signed-out may supply one.
    const contactEmail = authenticated ? personEmail : normalizeEmail(input.email);

    // Sink 1 — persist (best-effort, never-throw).
    const stored = await recordFeedback({
      category,
      message,
      path,
      userAgent,
      errorDigest,
      personId,
      contactEmail,
      authenticated,
    });

    // Sink 2 — email support (best-effort, never-throw).
    const reporter = personName
      ? `${personName}${contactEmail ? ` <${contactEmail}>` : ""}`
      : contactEmail;
    const template = feedbackReceived({
      category,
      message,
      path,
      userAgent,
      errorDigest,
      reporter,
    });
    const emailed = await sendEmail({
      to: FEEDBACK_INBOX,
      subject: template.subject,
      html: template.html,
      text: template.text,
      replyTo: contactEmail,
    });

    if (!stored.stored && !emailed.success) {
      feedbackLog.error("Feedback dropped — both sinks failed", {
        data: { store: stored.error, email: emailed.error },
      });
      return {
        success: false,
        error: "We couldn't send your feedback right now. Please try again later.",
      };
    }

    return { success: true };
  } catch (error) {
    // Belt-and-braces: nothing above should throw, but never surface a crash.
    feedbackLog.error("Unexpected feedback failure", {
      error: error instanceof Error ? error : new Error(String(error)),
    });
    return {
      success: false,
      error: "We couldn't send your feedback right now. Please try again later.",
    };
  }
}
