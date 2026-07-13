"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { useNyuchiHarness } from "@/components/ui/harness";

/* ═══════════════════════════════════════════════════════════════
   NYUCHI ACTION SHEET — brand component (pre-wired)

   A bottom-sheet list of contextual actions. Ported from mzizi and
   rewired onto nhimbe's harness. This is the branded pattern for a
   compact list of actions (with a destructive tier); use the shared
   ResponsiveModal / Drawer for richer form-bearing sheets instead of
   duplicating them here.
   ═══════════════════════════════════════════════════════════════ */

interface ActionSheetItem {
  /** Stable identifier. */
  id: string;
  /** Display label. */
  label: string;
  /** Leading icon (emoji or element). */
  icon?: React.ReactNode;
  /** Renders in the destructive colour. */
  destructive?: boolean;
  /** Selection handler. */
  onSelect: () => void;
}

interface NyuchiActionSheetProps {
  /** Whether the sheet is open. */
  open: boolean;
  /** Close handler. */
  onClose: () => void;
  /** Optional title shown above the actions. */
  title?: string;
  /** Action items. */
  actions: ActionSheetItem[];
  className?: string;
}

export function NyuchiActionSheet({ open, onClose, title, actions, className }: NyuchiActionSheetProps) {
  const { animStyle } = useNyuchiHarness("action-sheet");

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <>
      <div
        data-slot="nyuchi-action-sheet-scrim"
        className="fixed inset-0 z-50 bg-[var(--scrim)]"
        onClick={onClose}
        aria-hidden
      />
      <div
        data-slot="nyuchi-action-sheet"
        role="dialog"
        aria-label={title ?? "Actions"}
        aria-modal="true"
        className={cn(
          "fixed inset-x-0 bottom-0 z-50 rounded-t-[var(--radius-xl,17px)] border-t border-border bg-[var(--overlay)] pb-[env(safe-area-inset-bottom)]",
          className,
        )}
        style={animStyle({ keyframe: "nyuchi-fade-slide-up" })}
      >
        <div className="flex justify-center py-3">
          <div className="h-1 w-10 rounded-full bg-muted-foreground/20" />
        </div>

        {title && (
          <p className="px-5 pb-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
            {title}
          </p>
        )}

        <div className="px-2 pb-2">
          {actions.map((action) => (
            <button
              key={action.id}
              type="button"
              onClick={() => {
                action.onSelect();
                onClose();
              }}
              className={cn(
                "flex min-h-[48px] w-full items-center gap-3 rounded-[var(--radius-md,12px)] px-4 py-3.5 text-sm font-medium transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)]",
                action.destructive ? "text-[var(--color-error)]" : "text-foreground",
              )}
            >
              {action.icon && <span className="text-base">{action.icon}</span>}
              {action.label}
            </button>
          ))}
        </div>

        <div className="px-2 pb-3">
          <button
            type="button"
            onClick={onClose}
            className="flex h-12 w-full items-center justify-center rounded-[var(--radius-md,12px)] bg-muted text-sm font-medium text-foreground transition-colors hover:bg-muted/80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)]"
          >
            Cancel
          </button>
        </div>
      </div>
    </>
  );
}

export type { NyuchiActionSheetProps, ActionSheetItem };
