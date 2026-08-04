"use client";

/** Owner-only affordances on a calendar page: edit in place, archive it. */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Archive } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CreateCalendarModal } from "@/components/modals/calendar-modal";
import { archiveCalendarAction, type CalendarListItem } from "@/app/actions/calendars";
import type { CalendarViewData } from "./calendar-view";

function toListItem(calendar: CalendarViewData): CalendarListItem {
  return {
    id: calendar.id,
    slug: calendar.slug,
    name: calendar.name,
    description: calendar.description,
    visibility: calendar.visibility,
    theme: calendar.theme,
    circleId: calendar.circleId,
    followerCount: calendar.followerCount,
    eventCount: calendar.eventCount,
  };
}

export function OwnerActions({ calendar }: { calendar: CalendarViewData }) {
  const router = useRouter();
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isArchiving, startArchiving] = useTransition();

  function handleArchive() {
    if (!window.confirm(`Archive "${calendar.name}"? Followers will no longer see it.`)) return;
    startArchiving(async () => {
      await archiveCalendarAction(calendar.id);
      router.push("/calendars");
    });
  }

  return (
    <div className="flex items-center gap-2">
      <Button
        variant="ghost"
        onClick={() => setIsEditOpen(true)}
        className="inline-flex h-10 items-center gap-2 rounded-full bg-foreground/5 px-4 text-sm font-semibold text-foreground hover:bg-foreground/10"
      >
        <Pencil className="size-4" aria-hidden />
        Edit
      </Button>
      <Button
        variant="ghost"
        onClick={handleArchive}
        disabled={isArchiving}
        className="inline-flex h-10 items-center gap-2 rounded-full bg-foreground/5 px-4 text-sm font-semibold text-destructive hover:bg-destructive/10 disabled:opacity-60"
      >
        <Archive className="size-4" aria-hidden />
        {isArchiving ? "Archiving…" : "Archive"}
      </Button>
      <CreateCalendarModal
        isOpen={isEditOpen}
        onClose={() => setIsEditOpen(false)}
        editing={toListItem(calendar)}
        onUpdated={() => router.refresh()}
      />
    </div>
  );
}
