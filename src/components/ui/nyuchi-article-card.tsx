"use client";

import * as React from "react";
import { Clock, BookOpen, CheckCircle, AlertTriangle, HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useNyuchiHarness } from "@/components/ui/harness";

/* ═══════════════════════════════════════════════════════════════
   NYUCHI ARTICLE CARD — news / editorial listing (listing-card family).

   Row, compact and hero variants with a fact-check status chip. Ported
   from mzizi, rewired onto nhimbe's harness, and cleaned up (the source
   shipped duplicate className/tabIndex attributes on the hero variant).

   NOTE: nhimbe has no live articles surface yet — this ships as a
   ready-to-wire brand component for a future editorial/news feed.
   ═══════════════════════════════════════════════════════════════ */

type FactCheckStatus = "verified" | "disputed" | "unverified" | "false" | "pending";

const factCheckConfig: Record<
  FactCheckStatus,
  { label: string; color: string; icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }> }
> = {
  verified: { label: "Verified", color: "var(--color-malachite)", icon: CheckCircle },
  disputed: { label: "Disputed", color: "var(--color-gold)", icon: AlertTriangle },
  unverified: { label: "Unverified", color: "var(--muted-foreground, #6B6B66)", icon: HelpCircle },
  false: { label: "False", color: "var(--destructive, #FF5252)", icon: AlertTriangle },
  pending: { label: "Checking", color: "var(--color-cobalt)", icon: Clock },
};

interface NyuchiArticleCardProps {
  loading?: boolean;
  title: string;
  excerpt?: string;
  image?: string;
  sourceName?: string;
  sourceVerified?: boolean;
  authorName?: string;
  publishedAt?: string;
  readTime?: string;
  category?: string;
  factCheckStatus?: FactCheckStatus;
  variant?: "row" | "compact" | "hero";
  href?: string;
  onClick?: () => void;
  className?: string;
}

function NyuchiArticleCard({
  loading = false,
  title,
  excerpt,
  image,
  sourceName,
  sourceVerified,
  authorName,
  publishedAt,
  readTime,
  category,
  factCheckStatus,
  variant = "row",
  href,
  onClick,
  className,
}: NyuchiArticleCardProps) {
  const { animStyle } = useNyuchiHarness("article-card");

  if (loading) {
    return (
      <div
        data-slot="nyuchi-article-card"
        data-loading
        role="article"
        aria-busy="true"
        className="animate-pulse space-y-3 rounded-[var(--radius-lg,14px)] bg-card p-4 ring-1 ring-foreground/10"
      >
        <div className="flex gap-3">
          <div className="size-20 shrink-0 rounded-[var(--radius-md,12px)] bg-muted" />
          <div className="flex-1 space-y-2">
            <div className="h-3.5 w-3/4 rounded bg-muted" />
            <div className="h-2.5 w-full rounded bg-muted" />
            <div className="h-2.5 w-1/2 rounded bg-muted" />
          </div>
        </div>
      </div>
    );
  }

  const fc = factCheckStatus ? factCheckConfig[factCheckStatus] : null;
  const FcIcon = fc?.icon;
  const style = animStyle();
  const interactive = !!(href || onClick);
  const Tag = href ? "a" : "div";
  const linkProps = href ? { href } : { onClick, tabIndex: interactive ? 0 : undefined };

  if (variant === "hero") {
    return (
      <Tag
        {...linkProps}
        data-slot="nyuchi-article-card"
        data-variant="hero"
        role="article"
        style={style}
        className={cn(
          "relative flex min-h-[200px] flex-col justify-end overflow-hidden rounded-[var(--radius-card,14px)] p-5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)]",
          interactive && "cursor-pointer",
          className,
        )}
      >
        {image && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={image} alt="" className="absolute inset-0 size-full object-cover" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent" />
        <div className="relative z-10">
          {category && (
            <span className="mb-2 inline-flex rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white">
              {category}
            </span>
          )}
          <h3 className="font-serif text-lg font-bold leading-snug text-white">{title}</h3>
          <div className="mt-2 flex items-center gap-3 text-xs text-white/60">
            {sourceName && <span>{sourceName}</span>}
            {publishedAt && <span>{publishedAt}</span>}
            {readTime && (
              <span className="flex items-center gap-1">
                <BookOpen className="size-3" />
                {readTime}
              </span>
            )}
          </div>
        </div>
      </Tag>
    );
  }

  if (variant === "compact") {
    return (
      <Tag
        {...linkProps}
        data-slot="nyuchi-article-card"
        data-variant="compact"
        role="article"
        style={style}
        className={cn(
          "block overflow-hidden rounded-[var(--radius-card,14px)] bg-card ring-1 ring-foreground/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)]",
          interactive && "cursor-pointer transition-shadow hover:shadow-md",
          className,
        )}
      >
        {image && (
          <div className="aspect-video overflow-hidden bg-muted">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={image} alt="" className="size-full object-cover" />
          </div>
        )}
        <div className="p-4">
          {category && (
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {category}
            </span>
          )}
          <h4 className="mt-1 line-clamp-2 text-sm font-medium text-foreground">{title}</h4>
          {excerpt && <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{excerpt}</p>}
          <div className="mt-2 flex items-center justify-between text-[10px] text-muted-foreground">
            <span>{sourceName || authorName}</span>
            <div className="flex items-center gap-2">
              {readTime && <span>{readTime}</span>}
              {fc && FcIcon && <FcIcon className="size-3" style={{ color: fc.color }} />}
            </div>
          </div>
        </div>
      </Tag>
    );
  }

  return (
    <Tag
      {...linkProps}
      data-slot="nyuchi-article-card"
      data-variant="row"
      role="article"
      style={style}
      className={cn(
        "flex items-center gap-3 rounded-[var(--radius-card,14px)] bg-card px-4 py-3 ring-1 ring-foreground/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)]",
        interactive && "cursor-pointer transition-shadow hover:shadow-md",
        className,
      )}
    >
      <div className="min-w-0 flex-1">
        {category && (
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            {category}
          </span>
        )}
        <h4 className="line-clamp-2 text-sm font-medium text-foreground">{title}</h4>
        <div className="mt-1.5 flex items-center gap-2 text-xs text-muted-foreground">
          {sourceName && (
            <span className="flex items-center gap-1">
              {sourceName}
              {sourceVerified && <CheckCircle className="size-2.5 text-[var(--color-malachite)]" />}
            </span>
          )}
          {publishedAt && <span>· {publishedAt}</span>}
          {readTime && (
            <span className="flex items-center gap-1">
              <BookOpen className="size-3" />
              {readTime}
            </span>
          )}
        </div>
        {fc && FcIcon && (
          <span className="mt-1 flex items-center gap-1 text-[10px] font-medium" style={{ color: fc.color }}>
            <FcIcon className="size-3" />
            {fc.label}
          </span>
        )}
      </div>
      {image && (
        <div className="size-16 shrink-0 overflow-hidden rounded-[var(--radius-inner,7px)] bg-muted">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={image} alt="" className="size-full object-cover" />
        </div>
      )}
    </Tag>
  );
}

export { NyuchiArticleCard };
export type { NyuchiArticleCardProps, FactCheckStatus };
