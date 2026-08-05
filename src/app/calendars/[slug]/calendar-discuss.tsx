"use client";

/** Lazily opens the calendar's "Discuss" campfire thread — created on first use. */

import { LazyDiscussThread } from "@/components/ui/lazy-discuss-thread";
import { ensureCalendarConversationAction } from "@/app/actions/calendars";

export function CalendarDiscuss({
  calendarId,
  isAuthenticated,
}: {
  calendarId: string;
  isAuthenticated: boolean;
}) {
  return (
    <LazyDiscussThread
      isAuthenticated={isAuthenticated}
      resolveConversationId={() => ensureCalendarConversationAction(calendarId)}
    />
  );
}
