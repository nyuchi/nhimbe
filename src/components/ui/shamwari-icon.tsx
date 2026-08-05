"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { useNyuchiHarness } from "@/components/ui/harness";
import { SectionErrorBoundary } from "@/components/error/section-error-boundary";

/**
 * The Shamwari (AI) mark — a hex cluster, standing in everywhere the product
 * previously reached for a generic lucide `Bot`/`Sparkles`. Drop-in like any
 * lucide icon (`className`, `size`, ...svg props); defaults to a slow idle
 * pulse honouring `prefers-reduced-motion`, and to `role="img"` +
 * `aria-label="Shamwari AI"` unless the caller marks it decorative via
 * `aria-hidden` (the usual pattern when adjacent text already says
 * "Shamwari").
 */
export interface ShamwariIconProps extends Omit<React.SVGProps<SVGSVGElement>, "children"> {
  size?: number;
  /** Set false to render statically — e.g. inside an already-animating parent. */
  animate?: boolean;
}

function ShamwariIconMark({
  size = 24,
  animate = true,
  className,
  style,
  "aria-hidden": ariaHiddenProp,
  "aria-label": ariaLabelProp,
  ...rest
}: ShamwariIconProps) {
  const { motion } = useNyuchiHarness("shamwari-icon");
  const isDecorative = ariaHiddenProp === true || ariaHiddenProp === "true";
  const shouldAnimate = animate && !motion.prefersReduced;

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn("shamwari-icon", className)}
      role={isDecorative ? undefined : "img"}
      aria-hidden={isDecorative ? "true" : undefined}
      aria-label={isDecorative ? undefined : ariaLabelProp ?? "Shamwari AI"}
      style={
        shouldAnimate
          ? {
              animation:
                "shamwari-icon-pulse var(--motion-duration-slow, 2.4s) var(--motion-ease-spring, cubic-bezier(0.34, 1.2, 0.64, 1)) infinite",
              transformOrigin: "center",
              ...style,
            }
          : style
      }
      {...rest}
    >
      <path d="M5.3 4.3v3.9L2 10.1v3.8l3.3 1.9v3.9l3.4 1.9 3.3-1.9 3.3 1.9 3.4-1.9v-3.9l3.3-1.9v-3.8l-3.3-1.9V4.3l-3.4-1.9L12 4.3 8.7 2.4Z" />
      <path d="M12 8.2V4.3" />
      <path d="m18.7 8.2-3.4 1.9" />
      <path d="m15.3 13.9 3.4 1.9" />
      <path d="M12 19.7v-3.9" />
      <path d="m8.7 13.9-3.4 1.9" />
      <path d="m5.3 8.2 3.4 1.9" />
      <path d="m8.7 13.9 3.3 1.9 3.3-1.9v-3.8L12 8.2l-3.3 1.9Z" />
    </svg>
  );
}

const FALLBACK_LABEL = "Shamwari AI";

export function ShamwariIcon(props: ShamwariIconProps) {
  const size = props.size ?? 24;
  return (
    <SectionErrorBoundary
      section="shamwari-icon"
      fallback={
        <span
          role={props["aria-hidden"] ? undefined : "img"}
          aria-hidden={props["aria-hidden"] ? "true" : undefined}
          aria-label={props["aria-hidden"] ? undefined : props["aria-label"] ?? FALLBACK_LABEL}
          style={{ display: "inline-block", width: size, height: size }}
        />
      }
    >
      <style>{`
        @keyframes shamwari-icon-pulse {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.06); opacity: 0.85; }
        }
      `}</style>
      <ShamwariIconMark {...props} />
    </SectionErrorBoundary>
  );
}
