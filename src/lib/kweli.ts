/**
 * Kweli integration helpers — Mukoko Kweli (kweli.mukoko.com) is the
 * ecosystem's single venue-verification surface.
 *
 * Doctrine: nhimbe NEVER writes or implements venue verification. It only
 *   (a) READS a place's `bundu.verificationTier` from the graph and renders
 *       the mineral-tiered `nyuchi-verified-badge`, and
 *   (b) deep-links unverified venues to the Kweli verification gateway.
 *
 * The tier ladder (the `nyuchi-verified-badge` contract):
 *   0 unverified (no badge) · 1 community (Terracotta) · 2 otp (Cobalt)
 *   3 government (Gold) · 4 licensed (Tanzanite)
 */

import type { VerificationTier } from "@/components/ui/verified-badge";

/** Kweli verification gateway base (locale-prefixed per the Kweli URL shape). */
export const KWELI_VERIFY_URL = "https://kweli.mukoko.com/en/verify";

/** Ordered tier codes — index IS the numeric tier level. */
const TIER_CODES: readonly VerificationTier[] = [
  "unverified",
  "community",
  "otp",
  "government",
  "licensed",
];

/**
 * Coerce a raw `bundu.verificationTier` value into a numeric tier level 0–4.
 *
 * The graph documents this as a number, but defensively accept numeric
 * strings (validators permit extra shapes and other producers exist).
 * Anything unparseable, negative, or fractional-garbage degrades to 0 —
 * absence of verification, never an error.
 */
export function verificationTierLevel(raw: unknown): number {
  const n =
    typeof raw === "number"
      ? raw
      : typeof raw === "string" && raw.trim() !== ""
        ? Number(raw)
        : Number.NaN;
  if (!Number.isFinite(n)) return 0;
  const level = Math.floor(n);
  if (level < 0) return 0;
  if (level > 4) return 4;
  return level;
}

/** Map a raw tier value to the `nyuchi-verified-badge` tier code. */
export function verificationTierCode(raw: unknown): VerificationTier {
  return TIER_CODES[verificationTierLevel(raw)];
}

/**
 * Build the Kweli gateway deep-link for verifying a venue/entity.
 *
 * Prefers the place id (`?place=`); falls back to the owning entity id
 * (`?entity=`) when only that is at hand. Returns null when neither id is
 * available — callers render nothing.
 */
export function kweliVerifyUrl(opts: {
  placeId?: string | null;
  entityId?: string | null;
  source?: string;
}): string | null {
  const source = opts.source ?? "nhimbe";
  if (opts.placeId) {
    return `${KWELI_VERIFY_URL}?place=${encodeURIComponent(opts.placeId)}&source=${encodeURIComponent(source)}`;
  }
  if (opts.entityId) {
    return `${KWELI_VERIFY_URL}?entity=${encodeURIComponent(opts.entityId)}&source=${encodeURIComponent(source)}`;
  }
  return null;
}
