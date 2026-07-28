"use client";

/**
 * "Report this problem" — a leaf button that opens the global feedback dialog
 * prefilled as a bug, carrying an optional error digest / context message.
 *
 * Split out as its own function component so class-based error boundaries (which
 * cannot call hooks) can still render it inside their fallback and reach the
 * `useFeedback` context. Safe to render anywhere: `useFeedback` degrades to a
 * no-op outside the provider, so it never crashes a fallback that has already
 * caught one error.
 */

import * as React from "react";
import { MessageSquareWarning } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useFeedback } from "./feedback-context";

interface ReportProblemButtonProps {
  /** Next.js error digest, attached to the report for triage. */
  errorDigest?: string;
  /** Section/label used to seed the message so we know where it broke. */
  context?: string;
  className?: string;
  variant?: React.ComponentProps<typeof Button>["variant"];
  size?: React.ComponentProps<typeof Button>["size"];
}

export function ReportProblemButton({
  errorDigest,
  context,
  className,
  variant = "ghost",
  size = "sm",
}: ReportProblemButtonProps) {
  const { open } = useFeedback();

  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      className={className}
      onClick={() =>
        open({
          category: "bug",
          errorDigest,
          message: context ? `Problem on: ${context}\n\n` : "",
        })
      }
    >
      <MessageSquareWarning className="w-4 h-4" />
      Report this problem
    </Button>
  );
}
