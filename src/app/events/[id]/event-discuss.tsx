"use client";

/**
 * Lazily opens an event's live group chat — the reverse of the dead
 * `event.campfireConversationId` field (never populated by this repo).
 * Self-contained: resolves the viewer's auth state directly so callers only
 * need to pass the event id.
 */

import { useAuth } from "@/components/auth/auth-context";
import { LazyDiscussThread } from "@/components/ui/lazy-discuss-thread";
import { ensureEventChatConversationAction } from "@/app/actions/campfire";

export function EventDiscuss({ eventId }: { eventId: string }) {
  const { isAuthenticated } = useAuth();
  return (
    <LazyDiscussThread
      isAuthenticated={isAuthenticated}
      resolveConversationId={() => ensureEventChatConversationAction(eventId)}
    />
  );
}
