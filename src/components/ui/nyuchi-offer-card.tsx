"use client";

import * as React from "react";
import { ShoppingBag, MessageCircle, Shield } from "lucide-react";
import { cn } from "@/lib/utils";
import { useNyuchiHarness } from "@/components/ui/harness";
import type { Mineral } from "@/lib/category-mineral";

/* ═══════════════════════════════════════════════════════════════
   NYUCHI OFFER CARD — marketplace listing (listing-card family).

   Product/offer card with image, discount badge, condition tag, price
   (with strikethrough original), seller line and an inquiry CTA. Ported
   from mzizi, rewired onto nhimbe's harness, and cleaned up (the source
   shipped duplicate className/tabIndex attributes).

   NOTE: nhimbe has no live marketplace/offers surface yet — this ships
   as a ready-to-wire brand component.
   ═══════════════════════════════════════════════════════════════ */

interface NyuchiOfferCardProps {
  loading?: boolean;
  title: string;
  image?: string;
  price: number;
  originalPrice?: number;
  currency?: string;
  sellerName?: string;
  sellerVerified?: boolean;
  category?: string;
  condition?: "new" | "used" | "refurbished";
  mineral?: Mineral;
  href?: string;
  onInquire?: () => void;
  onClick?: () => void;
  className?: string;
}

const mineralColors: Record<Mineral, string> = {
  malachite: "var(--color-malachite)",
  cobalt: "var(--color-cobalt)",
  gold: "var(--color-gold)",
  tanzanite: "var(--color-tanzanite)",
  terracotta: "var(--color-terracotta)",
};

function NyuchiOfferCard({
  loading = false,
  title,
  image,
  price,
  originalPrice,
  currency = "USD",
  sellerName,
  sellerVerified,
  category,
  condition,
  mineral = "tanzanite",
  href,
  onInquire,
  onClick,
  className,
}: NyuchiOfferCardProps) {
  const { animStyle } = useNyuchiHarness("offer-card");

  if (loading) {
    return (
      <div
        data-slot="nyuchi-offer-card"
        data-loading
        role="article"
        aria-busy="true"
        className="animate-pulse space-y-3 rounded-[var(--radius-lg,14px)] bg-card p-4 ring-1 ring-foreground/10"
      >
        <div className="flex gap-3">
          <div className="size-20 shrink-0 rounded-[var(--radius-md,12px)] bg-muted" />
          <div className="flex-1 space-y-2">
            <div className="h-3.5 w-3/4 rounded bg-muted" />
            <div className="h-2.5 w-1/2 rounded bg-muted" />
            <div className="h-4 w-1/3 rounded bg-muted" />
          </div>
        </div>
      </div>
    );
  }

  const formatter = new Intl.NumberFormat(undefined, { style: "currency", currency });
  const hasDiscount = originalPrice != null && originalPrice > price;
  const discountPercent = hasDiscount ? Math.round((1 - price / originalPrice!) * 100) : 0;
  const accent = mineralColors[mineral];
  const interactive = !!(href || onClick);
  const Tag = href ? "a" : "div";
  const linkProps = href ? { href } : { onClick, tabIndex: interactive ? 0 : undefined };

  return (
    <Tag
      {...linkProps}
      data-slot="nyuchi-offer-card"
      data-mineral={mineral}
      role="article"
      style={animStyle()}
      className={cn(
        "block overflow-hidden rounded-[var(--radius-card,14px)] bg-card ring-1 ring-foreground/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)]",
        interactive && "cursor-pointer transition-shadow hover:shadow-md",
        className,
      )}
    >
      {image && (
        <div className="relative aspect-square overflow-hidden bg-muted">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={image} alt={title} className="size-full object-cover transition-transform hover:scale-105" />
          {hasDiscount && (
            <span
              className="absolute left-2 top-2 rounded-full px-2 py-0.5 text-[10px] font-bold text-background"
              style={{ backgroundColor: accent }}
            >
              -{discountPercent}%
            </span>
          )}
          {condition && condition !== "new" && (
            <span className="absolute right-2 top-2 rounded-full bg-black/50 px-2 py-0.5 text-[10px] font-medium capitalize text-white backdrop-blur-sm">
              {condition}
            </span>
          )}
        </div>
      )}
      <div className="p-3">
        {category && (
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            {category}
          </span>
        )}
        <h4 className="mt-0.5 line-clamp-2 text-sm font-medium text-foreground">{title}</h4>
        <div className="mt-1.5 flex items-baseline gap-2">
          <span className="text-base font-bold text-foreground">{formatter.format(price)}</span>
          {hasDiscount && (
            <span className="text-xs text-muted-foreground line-through">
              {formatter.format(originalPrice!)}
            </span>
          )}
        </div>
        {sellerName && (
          <div className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
            <ShoppingBag className="size-3" />
            <span>{sellerName}</span>
            {sellerVerified && <Shield className="size-3 text-[var(--color-gold)]" />}
          </div>
        )}
        {onInquire && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onInquire();
            }}
            className="mt-3 flex h-9 w-full items-center justify-center gap-1.5 rounded-full text-xs font-semibold text-background transition-colors"
            style={{ backgroundColor: accent }}
          >
            <MessageCircle className="size-3.5" />
            Inquire
          </button>
        )}
      </div>
    </Tag>
  );
}

export { NyuchiOfferCard };
export type { NyuchiOfferCardProps };
