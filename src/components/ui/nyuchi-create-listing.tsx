"use client";

import * as React from "react";
import { X, ImageIcon, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { useNyuchiHarness } from "@/components/ui/harness";

/* ═══════════════════════════════════════════════════════════════
   NYUCHI CREATE LISTING — universal create/edit form shell.

   The standardized Mukoko creation composition: cover theme picker, grouped
   form-section cards, settings-style rows, description area, and a sticky
   publish CTA. Ported from mzizi and rewired onto nhimbe's harness. These are
   presentational primitives — nhimbe's create-event flow keeps its own state
   and server action and mounts these for the branded shell.

   The publish CTA uses the brand primary (tanzanite), not malachite, to stay
   on nhimbe's lead mineral.
   ═══════════════════════════════════════════════════════════════ */

/** Predefined gradient themes (Five African Minerals). */
const MINERAL_GRADIENTS: [string, string][] = [
  ["#004D40", "#00695C"], // Malachite
  ["#4B0082", "#6A1B9A"], // Tanzanite
  ["#5D4037", "#795548"], // Terracotta
  ["#8B4513", "#A0522D"], // Gold (earth)
  ["#0047AB", "#1565C0"], // Cobalt
];

interface CoverThemePickerProps {
  selected: number;
  gradients?: [string, string][];
  onSelect: (index: number) => void;
  onImageTap?: () => void;
  coverImage?: string;
  className?: string;
}

function CoverThemePicker({
  selected,
  gradients = MINERAL_GRADIENTS,
  onSelect,
  onImageTap,
  coverImage,
  className,
}: CoverThemePickerProps) {
  useNyuchiHarness("create-listing");
  const activeGradient = gradients[selected] || gradients[0];

  return (
    <div
      data-slot="cover-theme-picker"
      className={cn("rounded-[var(--radius-card,14px)] bg-card p-4 ring-1 ring-foreground/10", className)}
    >
      <span className="mb-2 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Cover Theme</span>

      <button
        type="button"
        onClick={onImageTap}
        aria-label="Add cover image"
        className="relative mb-3 block w-full cursor-pointer overflow-hidden rounded-[var(--radius-inner,7px)] px-6 py-11 text-center"
        style={{ background: `linear-gradient(135deg, ${activeGradient[0]}, ${activeGradient[1]})` }}
      >
        <div
          className="absolute inset-0 opacity-5"
          style={{ backgroundImage: "radial-gradient(circle at 30% 70%, rgba(255,255,255,0.3) 0%, transparent 50%)" }}
        />
        {coverImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={coverImage} alt="Cover" className="absolute inset-0 size-full object-cover opacity-60" />
        ) : (
          <div className="relative flex flex-col items-center gap-2">
            <ImageIcon className="size-7 text-white/40" />
            <p className="text-[13px] text-white/60">Tap to add cover image</p>
          </div>
        )}
      </button>

      <div className="flex gap-2">
        {gradients.map((g, i) => (
          <button
            key={i}
            type="button"
            onClick={() => onSelect(i)}
            aria-label={`Theme ${i + 1}`}
            aria-pressed={selected === i}
            className={cn(
              "flex size-11 items-center justify-center rounded-[var(--radius-inner,7px)] border-2 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)]",
              selected === i ? "border-[var(--color-tanzanite)]" : "border-transparent",
            )}
            style={{ background: `linear-gradient(135deg, ${g[0]}, ${g[1]})` }}
          >
            {selected === i && <Check className="size-3.5 text-white" />}
          </button>
        ))}
      </div>
    </div>
  );
}

interface FormSectionProps {
  children: React.ReactNode;
  className?: string;
}

function FormSection({ children, className }: FormSectionProps) {
  return (
    <div
      data-slot="form-section"
      className={cn("overflow-hidden rounded-[var(--radius-card,14px)] bg-card ring-1 ring-foreground/10", className)}
    >
      {children}
    </div>
  );
}

interface FormRowProps {
  label: string | React.ReactNode;
  subtitle?: string;
  trailing?: React.ReactNode;
  last?: boolean;
  onClick?: () => void;
  className?: string;
}

function FormRow({ label, subtitle, trailing, last = false, onClick, className }: FormRowProps) {
  return (
    <div
      data-slot="form-row"
      onClick={onClick}
      className={cn(
        "flex items-center gap-3 px-4 py-3.5",
        !last && "border-b border-border",
        onClick && "cursor-pointer",
        className,
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="text-[15px] text-foreground">{label}</div>
        {subtitle && <div className="mt-0.5 text-xs text-muted-foreground">{subtitle}</div>}
      </div>
      {trailing && <div className="flex shrink-0 items-center gap-2">{trailing}</div>}
    </div>
  );
}

interface FormTextAreaProps {
  placeholder?: string;
  value?: string;
  onChange?: (value: string) => void;
  minRows?: number;
  className?: string;
}

function FormTextArea({ placeholder = "Add description…", value, onChange, minRows = 3, className }: FormTextAreaProps) {
  return (
    <div
      data-slot="form-textarea"
      className={cn("rounded-[var(--radius-card,14px)] bg-card p-4 ring-1 ring-foreground/10", className)}
    >
      <textarea
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        rows={minRows}
        className="w-full resize-none bg-transparent text-[15px] text-foreground placeholder:text-muted-foreground focus:outline-none"
      />
    </div>
  );
}

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
            "flex h-[52px] flex-1 items-center justify-center gap-2 rounded-full bg-primary text-base font-semibold text-primary-foreground",
            "transition-opacity disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)]",
          )}
        >
          {loading ? "Publishing…" : label}
        </button>
      </div>
    </div>
  );
}

interface CreateHeaderProps {
  title: string;
  onCancel?: () => void;
  actions?: React.ReactNode;
  className?: string;
}

function CreateHeader({ title, onCancel, actions, className }: CreateHeaderProps) {
  return (
    <div
      data-slot="create-header"
      className={cn("flex h-[52px] items-center justify-between border-b border-border bg-card px-5", className)}
    >
      <button type="button" onClick={onCancel} className="flex items-center gap-1.5 text-[15px] text-muted-foreground">
        <X className="size-5" />
        Cancel
      </button>
      <span className="text-base font-bold text-foreground">{title}</span>
      <div className="w-[70px]">{actions}</div>
    </div>
  );
}

export { CoverThemePicker, FormSection, FormRow, FormTextArea, PublishBar, CreateHeader, MINERAL_GRADIENTS };
export type { CoverThemePickerProps, FormSectionProps, FormRowProps, FormTextAreaProps, PublishBarProps, CreateHeaderProps };
