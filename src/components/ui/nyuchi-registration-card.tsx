"use client";

import * as React from "react";
import { Minus, Plus, Ticket, Loader2, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { useNyuchiHarness } from "@/components/ui/harness";

/* ═══════════════════════════════════════════════════════════════
   NYUCHI REGISTRATION CARD — 4.2.0 ticket registration panel.

   A labelled header, a selectable ticket-tier list (radio
   semantics), a clamped quantity stepper, and one saturated accent
   CTA. Prices format as USD (Free for 0); sold-out tiers disable.
   Harness-wired so tier + quantity changes announce through the
   auto-mounted live region (imperative announce()). The CTA fill
   defaults to the event/brand primary and its text uses
   --primary-foreground for AAA on-accent contrast.
   ═══════════════════════════════════════════════════════════════ */

interface RegistrationTier {
  id: string;
  name: string;
  price: string | number;
  note?: string;
  soldOut?: boolean;
  remaining?: number;
}

interface NyuchiRegistrationCardProps {
  tiers: RegistrationTier[];
  selectedTierId?: string;
  onSelectTier?: (id: string) => void;
  quantity?: number;
  min?: number;
  max?: number;
  onQuantityChange?: (quantity: number) => void;
  /** Header label. */
  label?: string;
  /** Optional helper line under the label. */
  helper?: string;
  ctaLabel?: string;
  onSubmit?: (payload: { tierId: string | null; quantity: number }) => void;
  /** Saturated CTA fill. Defaults to the event/brand primary. */
  accent?: string;
  loading?: boolean;
  disabled?: boolean;
  className?: string;
}

function formatPrice(price: string | number): string {
  if (price === 0 || price === "Free" || price === "0") return "Free";
  return typeof price === "number"
    ? new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(price)
    : price;
}

function NyuchiRegistrationCard({
  tiers,
  selectedTierId,
  onSelectTier,
  quantity,
  min = 1,
  max = 10,
  onQuantityChange,
  label = "Registration",
  helper,
  ctaLabel,
  onSubmit,
  accent = "var(--event-primary, var(--primary))",
  loading = false,
  disabled = false,
  className,
}: NyuchiRegistrationCardProps) {
  const { animStyle, announce } = useNyuchiHarness("registration-card");

  const firstAvailable = tiers.find((t) => !t.soldOut)?.id ?? null;
  const [selected, setSelected] = React.useState<string | null>(selectedTierId ?? firstAvailable);
  const [qty, setQty] = React.useState<number>(quantity ?? min);

  React.useEffect(() => {
    if (selectedTierId !== undefined) setSelected(selectedTierId);
  }, [selectedTierId]);
  React.useEffect(() => {
    if (quantity !== undefined) setQty(quantity);
  }, [quantity]);

  const clamp = (n: number) => Math.max(min, Math.min(max, n));

  function pickTier(tier: RegistrationTier) {
    if (tier.soldOut || disabled) return;
    setSelected(tier.id);
    onSelectTier?.(tier.id);
    announce(`${tier.name} selected`);
  }

  function setQuantity(next: number) {
    const clamped = clamp(next);
    setQty(clamped);
    onQuantityChange?.(clamped);
    announce(`Quantity ${clamped}`);
  }

  const activeTier = tiers.find((t) => t.id === selected) ?? null;
  const unitPrice = activeTier && typeof activeTier.price === "number" ? activeTier.price : null;
  const totalPrice = unitPrice != null ? unitPrice * qty : null;
  const isFreeTier =
    activeTier != null && (activeTier.price === 0 || activeTier.price === "Free" || activeTier.price === "0");
  const cta =
    ctaLabel ??
    (totalPrice != null ? `Register — ${formatPrice(totalPrice)}` : isFreeTier ? "Register — Free" : "Register");

  return (
    <section
      data-slot="nyuchi-registration-card"
      style={animStyle()}
      className={cn(
        "flex flex-col gap-4 rounded-[var(--radius-card,14px)] border bg-card p-4 text-card-foreground",
        className,
      )}
    >
      {/* Header */}
      <div className="flex items-center gap-2">
        <span
          className="inline-flex size-8 shrink-0 items-center justify-center rounded-full"
          style={{ backgroundColor: `color-mix(in srgb, ${accent} 14%, transparent)`, color: accent }}
          aria-hidden
        >
          <Ticket className="size-4" strokeWidth={2.2} />
        </span>
        <div className="min-w-0">
          <div className="text-[16px] font-semibold leading-none text-foreground">{label}</div>
          {helper && <div className="mt-1 text-[13px] text-muted-foreground">{helper}</div>}
        </div>
      </div>

      {/* Tier list */}
      <div role="radiogroup" aria-label="Ticket tiers" className="flex flex-col gap-2">
        {tiers.map((tier) => {
          const isSelected = tier.id === selected;
          const sub = tier.soldOut
            ? "Sold out"
            : tier.note ?? (tier.remaining != null ? `${tier.remaining} left` : null);
          return (
            <button
              key={tier.id}
              type="button"
              role="radio"
              aria-checked={isSelected}
              disabled={tier.soldOut || disabled}
              onClick={() => pickTier(tier)}
              style={
                isSelected
                  ? { borderColor: accent, backgroundColor: `color-mix(in srgb, ${accent} 8%, transparent)` }
                  : undefined
              }
              className={cn(
                "flex min-h-[48px] items-center justify-between gap-3 rounded-[var(--radius-md,12px)] border px-3.5 py-2.5 text-left transition-colors",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)]",
                "disabled:cursor-not-allowed disabled:opacity-55",
                !isSelected && "border-border hover:bg-muted/50",
              )}
            >
              <span className="min-w-0">
                <span className="flex items-center gap-2">
                  <span className="truncate text-[15px] font-medium text-foreground">{tier.name}</span>
                  {isSelected && <Check className="size-4 shrink-0" style={{ color: accent }} aria-hidden />}
                </span>
                {sub && <span className="mt-0.5 block truncate text-[13px] text-muted-foreground">{sub}</span>}
              </span>
              <span
                className="shrink-0 text-[15px] font-semibold"
                style={{ color: tier.soldOut ? "var(--muted-foreground)" : accent }}
              >
                {formatPrice(tier.price)}
              </span>
            </button>
          );
        })}
      </div>

      {/* Quantity stepper */}
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-medium text-muted-foreground">Quantity</span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label="Decrease quantity"
            onClick={() => setQuantity(qty - 1)}
            disabled={disabled || qty <= min}
            className="inline-flex size-12 items-center justify-center rounded-full border transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)] disabled:opacity-40"
          >
            <Minus className="size-4" aria-hidden />
          </button>
          <span className="w-10 text-center text-[16px] font-semibold tabular-nums text-foreground">{qty}</span>
          <button
            type="button"
            aria-label="Increase quantity"
            onClick={() => setQuantity(qty + 1)}
            disabled={disabled || qty >= max}
            className="inline-flex size-12 items-center justify-center rounded-full border transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)] disabled:opacity-40"
          >
            <Plus className="size-4" aria-hidden />
          </button>
        </div>
      </div>

      {/* CTA */}
      <button
        type="button"
        onClick={() => onSubmit?.({ tierId: selected, quantity: qty })}
        disabled={disabled || loading || selected === null}
        className="flex h-[52px] min-h-[48px] w-full items-center justify-center gap-2 rounded-full text-[16px] font-semibold transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)] disabled:opacity-50"
        style={{ backgroundColor: accent, color: "var(--primary-foreground, #fff)" }}
      >
        {loading && <Loader2 className="size-5 animate-spin" aria-hidden />}
        {loading ? "Processing…" : cta}
      </button>
    </section>
  );
}

export { NyuchiRegistrationCard };
export type { NyuchiRegistrationCardProps, RegistrationTier };
