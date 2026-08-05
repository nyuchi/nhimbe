"use client";

/**
 * Inline callout for "this needs Mukoko Pro" moments — the Shamwari AI gate,
 * and future blast/API-quota gates as they grow their own UI. Distinct from
 * `NyuchiAlertBanner` (a severity-coded status/weather banner): this is a
 * single-purpose upgrade prompt, not a generic alert.
 */

import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

interface UpgradeToProAlertProps {
  message: string;
  className?: string;
}

export function UpgradeToProAlert({ message, className }: UpgradeToProAlertProps) {
  return (
    <div
      role="alert"
      data-slot="upgrade-to-pro-alert"
      className={cn(
        "flex items-start gap-3 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3",
        className,
      )}
    >
      <Sparkles className="w-4 h-4 text-primary shrink-0 mt-0.5" aria-hidden />
      <p className="text-sm text-foreground flex-1 min-w-0">{message}</p>
    </div>
  );
}
