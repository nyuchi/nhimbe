"use client";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import { ResponsiveModal } from "@/components/ui/responsive-modal";

interface DateTimeModalProps {
  isOpen: boolean;
  onClose: () => void;
  eventDate: string;
  setEventDate: (value: string) => void;
  startTime: string;
  setStartTime: (value: string) => void;
  endTime: string;
  setEndTime: (value: string) => void;
}

// Format a Date as a local `yyyy-mm-dd` string (no UTC shift, unlike toISOString).
function toDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function DateTimeModal({
  isOpen,
  onClose,
  eventDate,
  setEventDate,
  startTime,
  setStartTime,
  endTime,
  setEndTime,
}: DateTimeModalProps) {
  const timeError = endTime && startTime && endTime <= startTime;

  // Parse the stored `yyyy-mm-dd` as a local date (append T00:00:00 so it isn't
  // interpreted as UTC midnight, which can roll back a day in western zones).
  const selectedDate = eventDate ? new Date(`${eventDate}T00:00:00`) : undefined;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const selectedLabel = selectedDate
    ? selectedDate.toLocaleDateString("en-US", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : "Tap a day below to choose your date";

  return (
    <ResponsiveModal open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }} title="Date & Time">
      <div className="space-y-4">
        <div>
          <Label className="block text-sm text-text-secondary mb-2">Date</Label>
          <div className="rounded-xl border border-border bg-surface p-2">
            <Calendar
              mode="single"
              selected={selectedDate}
              onSelect={(d) => { if (d) setEventDate(toDateString(d)); }}
              disabled={{ before: today }}
              defaultMonth={selectedDate ?? today}
              showOutsideDays
              className="mx-auto w-full bg-transparent p-1 [--cell-size:2.5rem]"
            />
          </div>
          <p className="mt-2 text-sm font-medium text-foreground" aria-live="polite">
            {selectedLabel}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label className="block text-sm text-text-secondary mb-2">Start Time</Label>
            <Input
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="w-full px-4 py-3 bg-surface text-foreground [color-scheme:light_dark] rounded-xl border border-border outline-none text-base"
            />
          </div>
          <div>
            <Label className="block text-sm text-text-secondary mb-2">End Time</Label>
            <Input
              type="time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              className={`w-full px-4 py-3 bg-surface text-foreground [color-scheme:light_dark] rounded-xl border border-border outline-none text-base ${timeError ? "ring-2 ring-red-500/50" : ""}`}
            />
          </div>
        </div>
        {timeError && (
          <p className="text-sm text-red-400">End time must be after start time</p>
        )}
        <div className="pt-2">
          <Button
            onClick={onClose}
            className="w-full h-[var(--touch-target)] bg-primary text-primary-foreground rounded-xl font-semibold"
          >
            Done
          </Button>
        </div>
      </div>
    </ResponsiveModal>
  );
}
