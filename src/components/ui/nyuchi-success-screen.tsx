"use client";

import * as React from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { useNyuchiHarness } from "@/components/ui/harness";
import { Button } from "@/components/ui/button";

/* ═══════════════════════════════════════════════════════════════
   NYUCHI SUCCESS SCREEN — brand component (pre-wired)

   The branded confirmation shown after a completed action (event
   published, RSVP confirmed, …). Ported from mzizi and rewired onto
   nhimbe's harness. Uses the malachite success mineral for the check
   and the tanzanite primary for the confirming action.
   ═══════════════════════════════════════════════════════════════ */

interface SuccessAction {
  label: string;
  onClick: () => void;
}

interface NyuchiSuccessScreenProps {
  title?: string;
  message?: string;
  /** Extra content between the message and the actions (e.g. a summary card). */
  detail?: React.ReactNode;
  primaryAction?: SuccessAction;
  secondaryAction?: SuccessAction;
  /** Override the default check icon. */
  icon?: React.ReactNode;
  className?: string;
}

export function NyuchiSuccessScreen({
  title = "Success",
  message,
  detail,
  primaryAction,
  secondaryAction,
  icon,
  className,
}: NyuchiSuccessScreenProps) {
  const { animStyle } = useNyuchiHarness("success-screen");

  return (
    <div
      data-slot="nyuchi-success-screen"
      role="status"
      aria-live="polite"
      className={cn("flex flex-col items-center gap-4 px-6 py-12 text-center", className)}
      style={animStyle()}
    >
      <div className="flex size-16 items-center justify-center rounded-full bg-[var(--color-malachite)]/15">
        {icon ?? (
          <Check className="size-8 text-[var(--color-malachite)]" strokeWidth={2.5} aria-hidden />
        )}
      </div>
      <h2 className="font-serif text-xl font-bold text-foreground">{title}</h2>
      {message && <p className="max-w-sm text-sm text-muted-foreground">{message}</p>}
      {detail}
      {(primaryAction || secondaryAction) && (
        <div className="mt-4 flex flex-wrap justify-center gap-3">
          {primaryAction && (
            <Button onClick={primaryAction.onClick} className="rounded-full">
              {primaryAction.label}
            </Button>
          )}
          {secondaryAction && (
            <Button variant="outline" onClick={secondaryAction.onClick} className="rounded-full">
              {secondaryAction.label}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

export type { NyuchiSuccessScreenProps };
