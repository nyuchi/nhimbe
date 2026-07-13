"use client";

// ── INFRASTRUCTURE HARNESS (auto-wired) ──
import { useNyuchiHarness } from "@/components/ui/harness";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

/* ═══════════════════════════════════════════════════════════════
   nyuchi profile settings — brand identity component.

   A settings shell: a section sidebar (scrollable row on mobile,
   column on desktop) + the active section's content + an optional
   sticky save bar. Data-driven via `sections` so it wraps whatever
   forms a surface needs. Ported from mzizi's static mock and turned
   into a reusable, harness-wired shell.
   ═══════════════════════════════════════════════════════════════ */

interface SettingsSection {
  id: string;
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
  content: React.ReactNode;
}

interface NyuchiProfileSettingsProps {
  sections: SettingsSection[];
  /** Controlled active section id. */
  activeId?: string;
  /** Default active section id (uncontrolled). Defaults to the first section. */
  defaultActiveId?: string;
  onActiveChange?: (id: string) => void;
  /** Show the sticky save / cancel bar. */
  showSaveBar?: boolean;
  onSave?: () => void;
  onCancel?: () => void;
  saveLabel?: string;
  saving?: boolean;
  className?: string;
}

function NyuchiProfileSettings({
  sections,
  activeId,
  defaultActiveId,
  onActiveChange,
  showSaveBar = false,
  onSave,
  onCancel,
  saveLabel = "Save changes",
  saving = false,
  className,
}: NyuchiProfileSettingsProps) {
  useNyuchiHarness("profile-settings");

  const [internalActive, setInternalActive] = React.useState(
    defaultActiveId ?? sections[0]?.id,
  );
  const active = activeId ?? internalActive;

  const setActive = (id: string) => {
    if (activeId == null) setInternalActive(id);
    onActiveChange?.(id);
  };

  const activeSection = sections.find((s) => s.id === active) ?? sections[0];

  return (
    <div
      data-slot="nyuchi-profile-settings"
      role="form"
      aria-label="Settings"
      className={cn("flex flex-col gap-6 md:flex-row", className)}
    >
      <aside className="w-full shrink-0 md:w-56">
        <nav className="flex flex-row gap-1 overflow-x-auto md:flex-col" aria-label="Settings sections">
          {sections.map((section) => {
            const Icon = section.icon;
            const isActive = section.id === active;
            return (
              <button
                key={section.id}
                type="button"
                aria-current={isActive ? "page" : undefined}
                onClick={() => setActive(section.id)}
                className={cn(
                  "flex items-center gap-2 whitespace-nowrap rounded-full px-3 py-2 text-sm transition-colors",
                  isActive
                    ? "bg-primary/10 font-medium text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                {Icon && <Icon className="size-4" />}
                {section.label}
              </button>
            );
          })}
        </nav>
      </aside>

      <div className="flex-1 space-y-6">
        {activeSection?.content}

        {showSaveBar && (
          <div className="sticky bottom-0 flex items-center justify-end gap-2 border-t border-border bg-background py-4">
            {onCancel && (
              <Button variant="outline" type="button" onClick={onCancel}>
                Cancel
              </Button>
            )}
            <Button type="button" onClick={onSave} disabled={saving}>
              {saveLabel}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

export { NyuchiProfileSettings };
export type { NyuchiProfileSettingsProps, SettingsSection };
