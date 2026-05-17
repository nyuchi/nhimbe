"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/auth/auth-context";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

/**
 * Persists event bookmarks to events.save_action.
 *
 * Schema (verified against platform-db via Supabase MCP):
 *   events.save_action(
 *     person_id  uuid NOT NULL,
 *     event_id   uuid NOT NULL,
 *     saved_at   timestamptz DEFAULT now(),
 *     PRIMARY KEY (person_id, event_id)
 *   )
 *
 * The composite PK makes save idempotent (a second insert would conflict —
 * we use upsert with ignoreDuplicates so re-saving is a no-op). Unsave is
 * just DELETE WHERE (person_id, event_id) — no soft-delete column exists.
 *
 * Returns null saved-state until the initial check resolves so callers can
 * render a loading state if they want; the toggle no-ops while the auth
 * context is empty (unauthenticated users get nothing to click).
 */
export function useSaveEvent(eventId: string) {
  const { user, isAuthenticated } = useAuth();
  const personId = (user as { person_id?: string } | null)?.person_id ?? null;
  const [saved, setSaved] = useState<boolean | null>(isAuthenticated ? null : false);
  const [busy, setBusy] = useState(false);

  // Initial read — does a row exist for (person, event)?
  useEffect(() => {
    if (!personId) {
      setSaved(false);
      return;
    }
    let cancelled = false;
    const supabase = getSupabaseBrowserClient();
    supabase
      .schema("events")
      .from("save_action")
      .select("person_id")
      .eq("person_id", personId)
      .eq("event_id", eventId)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) setSaved(!!data);
      });
    return () => {
      cancelled = true;
    };
  }, [personId, eventId]);

  const toggle = useCallback(async () => {
    if (!personId || busy) return;
    setBusy(true);
    const supabase = getSupabaseBrowserClient();
    try {
      if (saved) {
        await supabase
          .schema("events")
          .from("save_action")
          .delete()
          .eq("person_id", personId)
          .eq("event_id", eventId);
        setSaved(false);
      } else {
        // upsert with ignoreDuplicates means a concurrent save from a
        // second tab is silently absorbed instead of throwing.
        await supabase
          .schema("events")
          .from("save_action")
          .upsert(
            { person_id: personId, event_id: eventId },
            { onConflict: "person_id,event_id", ignoreDuplicates: true },
          );
        setSaved(true);
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
