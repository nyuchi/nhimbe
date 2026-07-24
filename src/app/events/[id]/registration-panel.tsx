"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { Check, LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NyuchiRegistrationCard, type RegistrationTier } from "@/components/ui/nyuchi-registration-card";
import { NamePrompt } from "@/components/prompts/name-prompt";
import { rsvpToEvent } from "@/app/actions/registrations";
import { trackEventViewAction } from "@/app/actions/discovery";
import { useAuth } from "@/components/auth/auth-context";

interface RegistrationPanelProps {
  eventId: string;
  price?: {
    price?: number;
    priceCurrency?: string;
    url?: string;
    availability?: string;
  };
  /** Remaining capacity — caps the party-size stepper when the event is capped. */
  spotsRemaining?: number | null;
}

// 1 attendee + up to 20 additional guests (mirrors MAX_ADDITIONAL_GUESTS on the
// server action). The stepper's party size maps to `additionalGuests = qty - 1`.
const MAX_PARTY = 21;

/**
 * Sidebar registration panel — the branded NyuchiRegistrationCard wired onto
 * nhimbe's RSVP flow. Adds party-size selection (the quantity stepper →
 * `additionalGuests`) on top of the existing one-tap RSVP, and preserves every
 * auth/name/confirmed/error state the plain RSVPButton handled. Chrome is
 * stripped (border-0 / transparent / no padding) so it sits inside the themed
 * ticket card; the CTA fill uses the event's --event-primary.
 */
export function RegistrationPanel({ eventId, price, spotsRemaining }: RegistrationPanelProps) {
  const [loading, setLoading] = useState(false);
  const [registered, setRegistered] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showNamePrompt, setShowNamePrompt] = useState(false);
  const [quantity, setQuantity] = useState(1);
  const pathname = usePathname();
  const { user, isAuthenticated, isLoading } = useAuth();

  // Track view on mount — best-effort, matches the RSVPButton behaviour.
  useEffect(() => {
    void trackEventViewAction(eventId);
  }, [eventId]);

  const isFree = !price?.price;
  const max = spotsRemaining != null ? Math.max(1, Math.min(MAX_PARTY, spotsRemaining)) : MAX_PARTY;
  const tiers: RegistrationTier[] = [
    {
      id: "ga",
      name: isFree ? "Free entry" : "General admission",
      price: price?.price ?? "Free",
      remaining: spotsRemaining ?? undefined,
    },
  ];

  const doRsvp = async (qty: number) => {
    if (!isAuthenticated || !user?.id) return;
    setLoading(true);
    setError(null);
    try {
      // Party size → additional guests. The server resolves the acting person
      // via AuthKit, so no token crosses from the client.
      await rsvpToEvent({ eventId, additionalGuests: Math.max(0, qty - 1) });
      setRegistered(true);
    } catch (err) {
      setError(
        err instanceof Error && err.message ? err.message : "Failed to register. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  };

  if (isLoading) {
    return (
      <Button variant="secondary" className="w-full py-4 text-base" disabled>
        Loading...
      </Button>
    );
  }

  if (!isAuthenticated) {
    return (
      <Link href={`/auth/hosted?return_to=${encodeURIComponent(pathname)}`}>
        <Button variant="default" className="w-full py-4 text-base">
          <LogIn className="w-5 h-5 mr-2" />
          Sign in to RSVP
        </Button>
      </Link>
    );
  }

  // Confirmed — reflect the rsvp_action state (with the chosen party size).
  if (registered) {
    return (
      <div
        data-slot="registration-confirmed"
        className="flex flex-wrap items-center justify-center gap-2 rounded-3xl px-4 py-3 text-[15px] font-semibold"
        style={{
          backgroundColor: "color-mix(in srgb, var(--event-primary) 14%, transparent)",
          color: "var(--event-primary)",
        }}
      >
        <Check className="size-5" aria-hidden />
        {quantity > 1 ? `You're going · party of ${quantity}` : "You're going"}
        <p className="basis-full text-center text-xs font-normal text-muted-foreground">
          Subscribed to host updates —{" "}
          <Link href="/profile/edit" className="underline hover:text-foreground">
            manage in preferences
          </Link>
        </p>
      </div>
    );
  }

  const needsName = !user?.name || user.name === "User";

  // Authenticated but nameless: the CTA opens the name prompt first, then RSVPs.
  if (needsName && showNamePrompt) {
    return <NamePrompt onComplete={() => doRsvp(quantity)} />;
  }

  return (
    <div>
      <NyuchiRegistrationCard
        className="border-0 bg-transparent p-0"
        label={isFree ? "Registration" : "Tickets"}
        tiers={tiers}
        quantity={quantity}
        min={1}
        max={max}
        onQuantityChange={setQuantity}
        loading={loading}
        accent="var(--event-primary)"
        onSubmit={({ quantity: q }) => (needsName ? setShowNamePrompt(true) : doRsvp(q))}
      />
      {error && (
        <div className="mt-2 rounded-lg bg-red-500/10 p-2">
          <span className="text-sm text-red-400">{error}</span>
        </div>
      )}
    </div>
  );
}
