"use client";

import * as React from "react";
import { ImagePlus, AtSign } from "lucide-react";
import { cn } from "@/lib/utils";
import { getInitials } from "@/lib/avatar-initials";
import { useNyuchiHarness } from "@/components/ui/harness";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

/* ═══════════════════════════════════════════════════════════════
   NYUCHI CONTENT COMPOSER — brand component (pre-wired)

   The branded freeform composer for posts, comments and status
   updates. Structured data creation uses nyuchi-create-listing
   instead. Ported from mzizi and rewired onto nhimbe's harness; reuses
   the shared Textarea + Button primitives. Brand primary (tanzanite)
   drives the submit action.
   ═══════════════════════════════════════════════════════════════ */

interface NyuchiContentComposerProps {
  placeholder?: string;
  avatarUrl?: string;
  userName?: string;
  submitLabel?: string;
  /** Submit handler — receives the trimmed text. */
  onSubmit?: (content: string) => void;
  /** Media attachment handler — renders the media button when provided. */
  onAttachMedia?: () => void;
  /** Mention handler — renders the mention button when provided. */
  onMention?: () => void;
  /** Whether a submission is in progress. */
  submitting?: boolean;
  /** Show the media/mention toolbar. */
  showToolbar?: boolean;
  /** Compact inline mode (comment replies). */
  compact?: boolean;
  className?: string;
}

export function NyuchiContentComposer({
  placeholder = "What’s on your mind?",
  avatarUrl,
  userName,
  submitLabel = "Post",
  onSubmit,
  onAttachMedia,
  onMention,
  submitting = false,
  showToolbar = true,
  compact = false,
  className,
}: NyuchiContentComposerProps) {
  const { animStyle } = useNyuchiHarness("content-composer");
  const [text, setText] = React.useState("");

  const handleSubmit = () => {
    const trimmed = text.trim();
    if (!trimmed || submitting) return;
    onSubmit?.(trimmed);
    setText("");
  };

  return (
    <div
      data-slot="nyuchi-content-composer"
      className={cn(
        "rounded-[var(--radius-lg,14px)] border border-border bg-card",
        compact ? "p-3" : "p-4",
        className,
      )}
      style={animStyle()}
    >
      <div className="flex gap-3">
        {!compact && (
          <div className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted text-xs font-bold text-muted-foreground">
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatarUrl} alt={userName ?? ""} className="size-full object-cover" />
            ) : (
              (getInitials(userName, 1) || "?")
            )}
          </div>
        )}

        <div className="min-w-0 flex-1 space-y-3">
          <Textarea
            aria-label="Compose content"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={placeholder}
            rows={compact ? 1 : 3}
            className="resize-none border-0 bg-transparent px-0 shadow-none focus-visible:ring-0 dark:bg-transparent"
          />

          <div className="flex items-center justify-between">
            {showToolbar && (onAttachMedia || onMention) ? (
              <div className="flex items-center gap-1">
                {onAttachMedia && (
                  <button
                    type="button"
                    onClick={onAttachMedia}
                    aria-label="Attach media"
                    className="flex size-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)]"
                  >
                    <ImagePlus className="size-4" />
                  </button>
                )}
                {onMention && (
                  <button
                    type="button"
                    onClick={onMention}
                    aria-label="Mention someone"
                    className="flex size-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)]"
                  >
                    <AtSign className="size-4" />
                  </button>
                )}
              </div>
            ) : (
              <span />
            )}

            <Button
              onClick={handleSubmit}
              disabled={!text.trim() || submitting}
              size="sm"
              className="rounded-full"
            >
              {submitting ? "Posting…" : submitLabel}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export type { NyuchiContentComposerProps };
