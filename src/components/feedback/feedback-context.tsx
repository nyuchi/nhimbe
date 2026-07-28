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
  /** Open the feedback dialog, optionally prefilled. */
  open: (prefill?: FeedbackPrefill) => void;
}

export const FeedbackContext = React.createContext<FeedbackContextValue | null>(null);

/**
 * Access the global feedback opener. Returns a no-op-safe object even outside
 * the provider so a stray call can never crash a render (it just does nothing) —
 * important for error-boundary fallbacks that may render before/without it.
 */
export function useFeedback(): FeedbackContextValue {
  const ctx = React.useContext(FeedbackContext);
  return ctx ?? { open: () => {} };
}
