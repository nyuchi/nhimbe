"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/auth/auth-context";
import { isEventSaved, saveEvent, unsaveEvent } from "@/app/actions/saves";

/**
 * Persists event bookmarks to the SHARED `engagement.interactions` collection
 * (`interactionType: "save"`) — the cross-product Mukoko substrate, no silos.
 *
 * The browser never touches Mongo — every read/write goes through the server
 * actions in `@/app/actions/saves`, which resolve the acting person via AuthKit
 * `withAuth()` (or the dev bypass) on Vercel's Node runtime. This replaces the
 * old direct-Supabase path that read/wrote `events.save_action` with the anon
 * key from the browser.
 *
 * The save is idempotent (the server upserts on a deterministic per-(person,
 * event) key), so a re-save from a second tab is silently absorbed. Unsave is a
 * plain delete — no soft-delete column.
 *
 * Returns null saved-state until the initial check resolves so callers can
 * render a loading state if they want; the toggle no-ops while the auth context
 * is empty (unauthenticated users get nothing to click).
 *
 * NOTE: the previous implementation read `user.person_id`, but the auth context
 * exposes the field as `personId`. That typo meant `personId` was always null,
 * so saving silently never worked. Fixed here to read `personId`.
 */
export function useSaveEvent(eventId: string) {
  const { user, isAuthenticated } = useAuth();
  const personId = user?.personId ?? null;
  const [saved, setSaved] = useState<boolean | null>(isAuthenticated ? null : false);
  const [busy, setBusy] = useState(false);

  // Initial read — is there a saved-event row for (person, event)?
  useEffect(() => {
    if (!personId) {
      setSaved(false);
      return;
    }
    let cancelled = false;
    isEventSaved(eventId)
      .then((result) => {
        if (!cancelled) setSaved(result);
      })
      .catch(() => {
        if (!cancelled) setSaved(false);
      });
    return () => {
      cancelled = true;
    };
  }, [personId, eventId]);

  const toggle = useCallback(async () => {
    if (!personId || busy) return;
    setBusy(true);
    try {
      if (saved) {
        const next = await unsaveEvent(eventId);
        setSaved(next);
      } else {
        const next = await saveEvent(eventId);
        setSaved(next);
      }
    } finally {
      setBusy(false);
    }
  }, [personId, eventId, saved, busy]);

  return {
    /** null while loading, true/false thereafter. */
    saved,
    /** Always toggles; safe to call from a button onClick. */
    toggle,
    /** Whether a network request is in flight. */
    busy,
    /** When false, the toggle is a no-op (no auth). */
    canSave: !!personId,
  };
}
