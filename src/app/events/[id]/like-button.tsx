"use client";

/**
 * Event like button — the LikeAction path onto the SHARED engagement
 * substrate (`engagement.reactions`, targetReferenceType "events_event").
 * Optimistic heart + count; signed-out users see the count read-only.
 */

import { useEffect, useState } from "react";
import { Heart } from "lucide-react";
import { getEventLikes, likeEvent, unlikeEvent } from "@/app/actions/saves";
import { useAuth } from "@/components/auth/auth-context";

export function LikeButton({ eventId }: { eventId: string }) {
  const { isAuthenticated } = useAuth();
  const [count, setCount] = useState(0);
  const [liked, setLiked] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getEventLikes(eventId)
      .then((s) => {
        if (cancelled) return;
        setCount(s.count);
        setLiked(s.likedByMe);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [eventId, isAuthenticated]);

  const toggle = async () => {
    if (!isAuthenticated || busy) return;
    setBusy(true);
    // Optimistic flip; the action returns the authoritative state.
    const next = !liked;
    setLiked(next);
    setCount((c) => Math.max(0, c + (next ? 1 : -1)));
    try {
      const state = next ? await likeEvent(eventId) : await unlikeEvent(eventId);
      setCount(state.count);
      setLiked(state.likedByMe);
    } catch {
      // Revert on failure.
      setLiked(!next);
      setCount((c) => Math.max(0, c + (next ? -1 : 1)));
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      onClick={toggle}
      disabled={!isAuthenticated || busy}
      className={`w-12 h-12 rounded-xl flex flex-col items-center justify-center shrink-0 border transition-colors disabled:opacity-50 ${
        liked ? "border-transparent" : "border-elevated hover:bg-elevated"
      }`}
      style={liked ? { backgroundColor: "var(--event-surface)", color: "var(--event-primary)" } : undefined}
      aria-label={liked ? "Unlike event" : "Like event"}
      aria-pressed={liked}
    >
      <Heart className={`w-5 h-5 ${liked ? "fill-current" : ""}`} />
      {count > 0 && <span className="text-[10px] leading-none mt-0.5">{count}</span>}
    </button>
  );
}
