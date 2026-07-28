"use client";

/**
 * Feedback context — the light shared surface between the provider and its
 * consumers.
 *
 * Deliberately dependency-free (React only): the `report-problem-button` leaf is
 * rendered from the section error boundary, which the harness imports across the
 * whole component library. If the button pulled in the full provider — and thus
 * `auth-context` / WorkOS AuthKit — every harness-based component would drag that
 * heavy chain in too. Keeping the context here lets consumers reach `open()`
 * without importing the provider's auth machinery.
 */

import * as React from "react";
import type { FeedbackCategory } from "@/lib/mongo/feedback";

/** Options a caller can pass when opening the dialog. */
export interface FeedbackPrefill {
  category?: FeedbackCategory;
  message?: string;
  /** Next.js error digest, when opened from an error boundary. */
  errorDigest?: string;
}

export interface FeedbackContextValue {
  /**
   * Primary opener. Routes to Intercom (our customer-support tool): opens the
   * Messenger's new-message composer prefilled with the report, or navigates to
   * /help (where the Messenger loads) when it isn't present on the current page.
   */
  open: (prefill?: FeedbackPrefill) => void;
  /**
   * Fallback opener — the built-in Resend/Mongo report dialog. Used on /help
   * only if the Intercom widget fails to load, so feedback is never a dead end.
   */
  openForm: (prefill?: FeedbackPrefill) => void;
}

export const FeedbackContext = React.createContext<FeedbackContextValue | null>(null);

/**
 * Access the global feedback opener. Returns a no-op-safe object even outside
 * the provider so a stray call can never crash a render (it just does nothing) —
 * important for error-boundary fallbacks that may render before/without it.
 */
export function useFeedback(): FeedbackContextValue {
  const ctx = React.useContext(FeedbackContext);
  return ctx ?? { open: () => {}, openForm: () => {} };
}

/** Window shape carrying the Intercom Messenger command function. */
type IntercomWindow = Window & {
  Intercom?: (command: string, ...args: unknown[]) => void;
};

/**
 * Compose a single Messenger message from a report prefill — category tag,
 * the message body, and the error reference when opened from a boundary.
 */
export function composeFeedbackMessage(prefill?: FeedbackPrefill): string {
  const parts: string[] = [];
  if (prefill?.category === "bug") parts.push("[Bug]");
  else if (prefill?.category === "idea") parts.push("[Idea]");
  const body = prefill?.message?.trim();
  if (body) parts.push(body);
  if (prefill?.errorDigest) parts.push(`(error ref: ${prefill.errorDigest})`);
  return parts.join(" ").trim() || "Hi! I'd like to share some feedback.";
}

/**
 * Open the Intercom Messenger's new-message composer if the widget is present
 * on the current page. Returns false when Intercom hasn't loaded (the widget is
 * only injected on the support surfaces) so the caller can fall back.
 */
export function openIntercomMessage(message: string): boolean {
  if (typeof window === "undefined") return false;
  const w = window as IntercomWindow;
  if (typeof w.Intercom !== "function") return false;
  w.Intercom("showNewMessage", message);
  return true;
}
