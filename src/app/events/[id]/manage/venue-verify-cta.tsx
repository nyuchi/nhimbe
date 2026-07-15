"use client";

import { useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { getPlaceById } from "@/app/actions/places";
import { kweliVerifyUrl } from "@/lib/kweli";

/**
 * "Verify this venue on Kweli" — host-surface deep-link to the ecosystem's
 * verification gateway (kweli.mukoko.com).
 *
 * Doctrine: nhimbe never implements venue verification itself. When an
 * event's venue is UNVERIFIED (`bundu.verificationTier` 0/absent), the host
 * managing the event gets a subtle nudge linking to the Kweli gateway
 * (`/en/verify?place=<placeId>&source=nhimbe`), where the claim → verify
 * flow lives. Verified venues (tier ≥ 1) render nothing — they already
 * carry the badge on the public event page.
 *
 * Rendered ONLY on the event-manage (host) surface — never on public pages.
 */
export function VenueVerifyCta({ placeId }: { placeId: string | null | undefined }) {
  const [unverified, setUnverified] = useState(false);

  useEffect(() => {
    if (!placeId) return;
    let cancelled = false;
    getPlaceById(placeId)
      .then((place) => {
        if (!cancelled) setUnverified(place !== null && place.verificationTier === 0);
      })
      .catch(() => {
        // Best-effort read — on failure simply don't nudge.
        if (!cancelled) setUnverified(false);
      });
    return () => {
      cancelled = true;
    };
  }, [placeId]);

  const href = kweliVerifyUrl({ placeId });
  if (!unverified || !href) return null;

  return (
    <a
      data-slot="venue-verify-cta"
      href={href}
      className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors underline underline-offset-2"
      title="This venue is not yet verified. Verification for the whole Mukoko ecosystem happens on Mukoko Kweli."
    >
      <ShieldCheck className="w-3.5 h-3.5" aria-hidden />
      Verify this venue on Kweli
    </a>
  );
}
