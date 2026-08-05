"use client";

/**
 * Lazily opens the circle's "Discuss" group chat — a WhatsApp-style channel
 * paired to the circle, distinct from its persistent post stream.
 */

import { LazyDiscussThread } from "@/components/ui/lazy-discuss-thread";
import { ensureCircleConversationAction } from "@/app/actions/circle-detail";

export function CircleDiscuss({
  circleId,
  isAuthenticated,
}: {
  circleId: string;
  isAuthenticated: boolean;
}) {
  return (
    <LazyDiscussThread
      isAuthenticated={isAuthenticated}
      resolveConversationId={() => ensureCircleConversationAction(circleId)}
      className="mb-4"
    />
  );
}
