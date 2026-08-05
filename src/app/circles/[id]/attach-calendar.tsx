"use client";

/**
 * Owner-only controls on a circle's Calendars tab: attach one of the owner's
 * own calendars to this circle, or create a new one already scoped to it.
 * The reverse of the calendar-side circle picker (NYU-25) — a calendar can
 * pick its circle when created/edited, but a circle previously had no way to
 * pull a calendar in from its own page.
 */

import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CreateCalendarModal } from "@/components/modals/calendar-modal";
import {
  getMyOwnedCalendarsAction,
  updateCalendarAction,
  type CalendarListItem,
} from "@/app/actions/calendars";

interface AttachCalendarProps {
  circleId: string;
  /** Ids already streaming through this circle — excluded from the picker. */
  attachedIds: string[];
  onAttached: () => void;
}

export function AttachCalendar({ circleId, attachedIds, onAttached }: AttachCalendarProps) {
  const [mine, setMine] = useState<CalendarListItem[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isAttaching, setIsAttaching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getMyOwnedCalendarsAction().then(setMine);
  }, []);

  const candidates = mine.filter((c) => !attachedIds.includes(c.id));

  async function handleAttach() {
    if (!selected) return;
    setIsAttaching(true);
    setError(null);
    try {
      await updateCalendarAction({ calendarId: selected, circleId });
      setSelected(null);
      onAttached();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not attach that calendar.");
    } finally {
      setIsAttaching(false);
    }
  }

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      {candidates.length > 0 && (
        <>
          <Select value={selected ?? undefined} onValueChange={setSelected}>
            <SelectTrigger className="w-56 rounded-xl">
              <SelectValue placeholder="Attach one of your calendars…" />
            </SelectTrigger>
            <SelectContent>
              {candidates.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="ghost"
            size="sm"
            disabled={!selected || isAttaching}
            onClick={handleAttach}
          >
            {isAttaching ? "Attaching…" : "Attach"}
          </Button>
        </>
      )}
      <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => setIsCreateOpen(true)}>
        <Plus className="w-4 h-4" aria-hidden />
        Create a calendar for this circle
      </Button>
      {error && <p className="w-full text-sm text-red-400">{error}</p>}
      <CreateCalendarModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        initialCircleId={circleId}
        onCreated={() => onAttached()}
      />
    </div>
  );
}
