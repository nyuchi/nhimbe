"use client";

/** Lazily opens the calendar's "Discuss" campfire thread — created on first use. */

import { useState, useTransition } from "react";
import { MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CampfireThread } from "@/components/ui/campfire-thread";
import { ensureCalendarConversationAction } from "@/app/actions/calendars";

export function CalendarDiscuss({
  calendarId,
  isAuthenticated,
}: {
  calendarId: string;
  isAuthenticated: boolean;
}) {
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (!isAuthenticated) return null;

  if (!conversationId) {
    return (
      <div className="mt-8">
        <Button
          variant="ghost"
          disabled={isPending}
          onClick={() => startTransition(async () => {
            const id = await ensureCalendarConversationAction(calendarId);
            setConversationId(id);
          })}
          className="gap-1.5 rounded-full text-sm"
        >
          <MessageCircle className="w-4 h-4" aria-hidden />
          {isPending ? "Opening…" : "Discuss"}
        </Button>
      </div>
    );
  }

  return (
    <CampfireThread
      conversationId={conversationId}
      title="Discuss"
      emptyLabel="No messages yet. Start the conversation."
    />
  );
}
