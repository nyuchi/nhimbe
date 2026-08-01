"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/* ═══════════════════════════════════════════════════════════════
   NYUCHI CREATE LISTING — the sticky publish CTA.

   Ported from mzizi and rewired onto nhimbe's harness. `PublishBar` is the
   only piece actually adopted — the create-event wizard keeps its own form
   state and layout, mounting this for the branded sticky CTA. Its siblings
   (CoverThemePicker, FormSection, FormRow, FormTextArea, CreateHeader) were
   ported but never wired into a real surface; removed rather than kept as
   unused surface area (2026-08 UI audit).

   The publish CTA uses the brand primary (tanzanite), not malachite, to stay
   on nhimbe's lead mineral.
   ═══════════════════════════════════════════════════════════════ */

interface PublishBarProps {
  label?: string;
  loading?: boolean;
  disabled?: boolean;
  onPublish?: () => void;
  secondary?: React.ReactNode;
  className?: string;
}

function PublishBar({ label = "Publish", loading = false, disabled = false, onPublish, secondary, className }: PublishBarProps) {
  return (
    <div
      data-slot="publish-bar"
      className={cn(
        "sticky bottom-0 z-10 bg-gradient-to-t from-background via-background/95 to-transparent px-5 pb-7 pt-4",
        className,
      )}
    >
      <div className="mx-auto flex max-w-150 items-center gap-3">
        {secondary}
        <button
          type="button"
          onClick={onPublish}
          disabled={disabled || loading}
          className={cn(
            "flex min-h-[52px] flex-1 items-center justify-center gap-2 rounded-full bg-primary px-6 text-base font-semibold whitespace-nowrap text-primary-foreground",
            "transition-opacity disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)]",
          )}
        >
          <span className="truncate">{loading ? "Publishing…" : label}</span>
        </button>
      </div>
    </div>
  );
}

export { PublishBar };
export type { PublishBarProps };
