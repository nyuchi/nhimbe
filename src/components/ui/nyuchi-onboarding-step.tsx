"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { useNyuchiHarness } from "@/components/ui/harness";
import { Button } from "@/components/ui/button";

/* ═══════════════════════════════════════════════════════════════
   NYUCHI ONBOARDING STEP — brand component (pre-wired)

   A single onboarding step: illustration, title, description, optional
   progress dots and Next / Skip actions. A `children` slot lets a step
   embed its own controls (e.g. a form) between the copy and the
   actions. Ported from mzizi, rewired onto nhimbe's harness. Brand
   primary (tanzanite) drives the accent + progress indicator.
   ═══════════════════════════════════════════════════════════════ */

interface NyuchiOnboardingStepProps {
  /** Illustration or emoji shown in the accent bubble. */
  illustration?: React.ReactNode;
  /** Step title. */
  title: string;
  /** Step description. */
  description: string;
  /** Optional embedded controls (form, chips, …). */
  children?: React.ReactNode;
  /** Current step index (0-based). */
  currentStep?: number;
  /** Total number of steps. */
  totalSteps?: number;
  /** Next button label. */
  nextLabel?: string;
  /** Skip button label. */
  skipLabel?: string;
  /** Next handler — renders the primary button when provided. */
  onNext?: () => void;
  /** Skip handler — renders the skip link when provided (hidden on last step). */
  onSkip?: () => void;
  className?: string;
}

export function NyuchiOnboardingStep({
  illustration,
  title,
  description,
  children,
  currentStep = 0,
  totalSteps = 1,
  nextLabel = "Next",
  skipLabel = "Skip",
  onNext,
  onSkip,
  className,
}: NyuchiOnboardingStepProps) {
  const { animStyle } = useNyuchiHarness("onboarding-step");
  const isLast = currentStep >= totalSteps - 1;

  return (
    <div
      data-slot="nyuchi-onboarding-step"
      role="region"
      aria-label="Onboarding"
      className={cn("flex flex-col items-center justify-center px-6 py-12 text-center", className)}
      style={animStyle()}
    >
      {illustration && (
        <div className="mb-8 flex size-24 items-center justify-center rounded-full bg-primary/10 text-4xl">
          {illustration}
        </div>
      )}

      <h2 className="font-serif text-xl font-bold text-foreground">{title}</h2>
      <p className="mt-3 max-w-[300px] text-sm leading-relaxed text-muted-foreground">
        {description}
      </p>

      {totalSteps > 1 && (
        <div className="mt-6 flex items-center gap-2">
          {Array.from({ length: totalSteps }).map((_, i) => (
            <div
              key={i}
              className={cn(
                "rounded-full transition-all",
                i === currentStep ? "h-2 w-6 bg-primary" : "size-2 bg-muted-foreground/20",
              )}
            />
          ))}
        </div>
      )}

      {children && <div className="mt-8 w-full max-w-[320px] text-left">{children}</div>}

      {(onNext || (onSkip && !isLast)) && (
        <div className="mt-8 flex w-full max-w-[280px] flex-col items-center gap-3">
          {onNext && (
            <Button onClick={onNext} className="h-14 w-full rounded-full text-[15px] font-semibold">
              {isLast ? "Get started" : nextLabel}
            </Button>
          )}
          {onSkip && !isLast && (
            <button
              type="button"
              onClick={onSkip}
              className="text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)]"
            >
              {skipLabel}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export type { NyuchiOnboardingStepProps };
