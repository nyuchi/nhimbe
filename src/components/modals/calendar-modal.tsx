"use client";

/**
 * Create/edit a followable calendar (NYU-25). Reuses the same host picker
 * and theme carousel as the create-event form — a calendar is curated
 * through an entity exactly the way an event is hosted through one.
 */

import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ResponsiveModal } from "@/components/ui/responsive-modal";
import { HostModePicker, type HostMode } from "@/app/events/create/host-mode-picker";
import { ThemeSelector } from "@/app/events/create/theme-selector";
import { themeIds, themes } from "@/lib/themes";
import {
  createCalendarAction,
  updateCalendarAction,
  getMyCirclesAction,
  type CreateCalendarResult,
  type CalendarListItem,
} from "@/app/actions/calendars";
import type { CalendarVisibility } from "@/lib/mongo/types";

const themeList = themeIds.map((id) => ({ id, name: themes[id].name, gradient: themes[id].gradient }));

const VISIBILITY_OPTIONS: { value: CalendarVisibility; label: string; hint: string }[] = [
  { value: "public", label: "Public", hint: "Listed in Discover and search" },
  { value: "unlisted", label: "Unlisted", hint: "Only reachable via direct link" },
  { value: "private", label: "Private", hint: "Only you can view it" },
];

interface CalendarModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated?: (result: CreateCalendarResult) => void;
  /** Pass the existing calendar to edit it in place rather than create a new one. */
  editing?: CalendarListItem | null;
  onUpdated?: (result: CalendarListItem) => void;
  /** Pre-select (and pre-attach) a circle when creating from that circle's page. */
  initialCircleId?: string | null;
}

export function CreateCalendarModal({
  isOpen,
  onClose,
  onCreated,
  editing = null,
  onUpdated,
  initialCircleId = null,
}: CalendarModalProps) {
  const [name, setName] = useState(editing?.name ?? "");
  const [description, setDescription] = useState(editing?.description ?? "");
  const [visibility, setVisibility] = useState<CalendarVisibility>(editing?.visibility ?? "public");
  const [selectedThemeIndex, setSelectedThemeIndex] = useState(() => {
    const idx = editing?.theme ? themeList.findIndex((t) => t.id === editing.theme) : -1;
    return idx >= 0 ? idx : 0;
  });
  const [hostMode, setHostMode] = useState<HostMode>("person");
  const [hostEntityId, setHostEntityId] = useState<string | null>(null);
  const [circles, setCircles] = useState<{ id: string; name: string }[]>([]);
  const [circleId, setCircleId] = useState<string | null>(editing?.circleId ?? initialCircleId);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isEditing = editing !== null;

  useEffect(() => {
    if (!isOpen) return;
    getMyCirclesAction().then(setCircles);
  }, [isOpen]);

  // Re-seed form state whenever a different calendar is opened for editing.
  useEffect(() => {
    if (!isOpen || !editing) return;
    setName(editing.name);
    setDescription(editing.description ?? "");
    setVisibility(editing.visibility);
    setCircleId(editing.circleId ?? null);
    const idx = editing.theme ? themeList.findIndex((t) => t.id === editing.theme) : -1;
    setSelectedThemeIndex(idx >= 0 ? idx : 0);
  }, [isOpen, editing]);

  async function handleSubmit() {
    setError(null);
    if (!name.trim()) {
      setError("Give your calendar a name.");
      return;
    }
    setIsSubmitting(true);
    try {
      if (isEditing) {
        const result = await updateCalendarAction({
          calendarId: editing.id,
          name: name.trim(),
          description: description.trim() || null,
          visibility,
          theme: themeList[selectedThemeIndex]?.id ?? null,
          circleId,
        });
        onUpdated?.(result);
      } else {
        const result = await createCalendarAction({
          name: name.trim(),
          description: description.trim() || null,
          visibility,
          theme: themeList[selectedThemeIndex]?.id ?? null,
          circleId,
          hostMode,
          hostEntityId,
        });
        onCreated?.(result);
        setName("");
        setDescription("");
        setVisibility("public");
        setSelectedThemeIndex(0);
        setHostMode("person");
        setHostEntityId(null);
        setCircleId(initialCircleId);
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save that calendar.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <ResponsiveModal
      open={isOpen}
      onOpenChange={(open) => { if (!open) onClose(); }}
      title={isEditing ? "Edit calendar" : "Create a calendar"}
      description="A followable stream for events that happen on a regular basis — a club, a series, a recurring meetup."
    >
      <div className="space-y-4 pb-2">
        <div>
          <Label className="block text-sm text-text-secondary mb-2">Name</Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., Harare Stroller Club"
            maxLength={120}
            className="w-full px-4 py-3 bg-surface text-foreground placeholder:text-text-tertiary rounded-xl border border-border outline-none focus-visible:ring-2 focus-visible:ring-ring/50 text-base"
          />
        </div>

        <div>
          <Label className="block text-sm text-text-secondary mb-2">Description</Label>
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What brings this crowd together?"
            maxLength={1000}
            className="w-full px-4 py-3 bg-surface text-foreground placeholder:text-text-tertiary rounded-2xl border border-border outline-none focus-visible:ring-2 focus-visible:ring-ring/50 text-base min-h-24"
          />
        </div>

        {!isEditing && (
          <HostModePicker hostMode={hostMode} hostEntityId={hostEntityId} onChange={(mode, id) => { setHostMode(mode); setHostEntityId(id); }} />
        )}

        <ThemeSelector themes={themeList} selectedIndex={selectedThemeIndex} onSelect={setSelectedThemeIndex} />

        <div>
          <Label className="block text-sm text-text-secondary mb-2">Visibility</Label>
          <RadioGroup value={visibility} onValueChange={(v) => setVisibility(v as CalendarVisibility)}>
            {VISIBILITY_OPTIONS.map((opt) => (
              <label
                key={opt.value}
                htmlFor={`calendar-visibility-${opt.value}`}
                className="flex items-center gap-3 p-3 bg-surface rounded-xl cursor-pointer select-none"
              >
                <RadioGroupItem value={opt.value} id={`calendar-visibility-${opt.value}`} />
                <span className="flex-1">
                  <span className="block font-medium text-foreground">{opt.label}</span>
                  <span className="block text-xs text-text-tertiary">{opt.hint}</span>
                </span>
              </label>
            ))}
          </RadioGroup>
        </div>

        {circles.length > 0 && (
          <div>
            <Label className="block text-sm text-text-secondary mb-2">Attach to a circle (optional)</Label>
            <Select
              value={circleId ?? "none"}
              onValueChange={(v) => setCircleId(v === "none" ? null : v)}
            >
              <SelectTrigger className="w-full rounded-xl">
                <SelectValue placeholder="No circle" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No circle</SelectItem>
                {circles.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {error && <p className="text-sm text-red-400">{error}</p>}

        <div className="pt-2">
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="w-full h-[var(--touch-target)] bg-primary text-primary-foreground rounded-xl font-semibold"
          >
            {isSubmitting ? "Saving…" : isEditing ? "Save changes" : "Create calendar"}
          </Button>
        </div>
      </div>
    </ResponsiveModal>
  );
}
