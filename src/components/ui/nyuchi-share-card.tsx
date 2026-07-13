"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { useNyuchiHarness } from "@/components/ui/harness";

/* ═══════════════════════════════════════════════════════════════
   NYUCHI SHARE CARD — brand component (pre-wired)

   The branded sharing sheet: a content preview plus share targets,
   presented as a bottom sheet. Ported from mzizi and rewired onto
   nhimbe's harness. Internal sharing (Campfire) is a first-class
   option ahead of external targets.
   ═══════════════════════════════════════════════════════════════ */

interface ShareTarget {
  id: string;
  label: string;
  icon: React.ReactNode;
  onShare: () => void;
}

interface NyuchiShareCardProps {
  /** Content title. */
  title: string;
  /** Content subtitle / description. */
  subtitle?: string;
  /** Preview image URL. */
  imageUrl?: string;
  /** Deep link URL. */
  url: string;
  /** Source app label, e.g. "nhimbe". */
  sourceApp?: string;
  /** Whether the sheet is open. */
  open: boolean;
  /** Close handler. */
  onClose: () => void;
  /** Copy-link handler. */
  onCopyLink?: () => void;
  /** Share-to-Campfire handler. */
  onShareToCampfire?: () => void;
  /** Native (Web Share API) handler. */
  onNativeShare?: () => void;
  /** Additional external targets. */
  targets?: ShareTarget[];
  /** Whether the link was just copied. */
  copied?: boolean;
  className?: string;
}

export function NyuchiShareCard({
  title,
  subtitle,
  imageUrl,
  url,
  sourceApp,
  open,
  onClose,
  onCopyLink,
  onShareToCampfire,
  onNativeShare,
  targets = [],
  copied = false,
  className,
}: NyuchiShareCardProps) {
  const { animStyle } = useNyuchiHarness("share-card");

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const rowClass =
    "flex min-h-[48px] w-full items-center gap-3 rounded-[var(--radius-md,12px)] px-4 py-3.5 text-sm font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)]";

  return (
    <>
      <div
        data-slot="nyuchi-share-card-scrim"
        className="fixed inset-0 z-50 bg-[var(--scrim)]"
        onClick={onClose}
        aria-hidden
      />
      <div
        data-slot="nyuchi-share-card"
        data-url={url}
        role="dialog"
        aria-label="Share"
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

        {/* Content preview */}
        <div className="mx-4 mb-4 flex gap-3 rounded-[var(--radius-md,12px)] bg-muted p-3">
          {imageUrl && (
            <div className="size-12 shrink-0 overflow-hidden rounded-[var(--radius-sm,7px)] bg-background">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={imageUrl} alt="" className="size-full object-cover" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-foreground">{title}</p>
            {subtitle && <p className="truncate text-[11px] text-muted-foreground">{subtitle}</p>}
            {sourceApp && <p className="mt-0.5 text-[10px] text-muted-foreground">via {sourceApp}</p>}
          </div>
        </div>

        {/* Share options */}
        <div className="space-y-1 px-4 pb-2">
          {onShareToCampfire && (
            <button
              type="button"
              onClick={() => {
                onShareToCampfire();
                onClose();
              }}
              className={rowClass}
            >
              <span className="text-base">🔥</span> Share to Campfire
            </button>
          )}
          {onCopyLink && (
            <button type="button" onClick={onCopyLink} className={rowClass}>
              <span className="text-base">{copied ? "✅" : "🔗"}</span>{" "}
              {copied ? "Link copied!" : "Copy link"}
            </button>
          )}
          {onNativeShare && (
            <button
              type="button"
              onClick={() => {
                onNativeShare();
                onClose();
              }}
              className={rowClass}
            >
              <span className="text-base">📤</span> Share via…
            </button>
          )}
          {targets.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                t.onShare();
                onClose();
              }}
              className={rowClass}
            >
              <span className="text-base">{t.icon}</span> {t.label}
            </button>
          ))}
        </div>

        <div className="px-4 pb-3">
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

export type { NyuchiShareCardProps, ShareTarget };
