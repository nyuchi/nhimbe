"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { trackEventView } from "@/lib/api";
import { rsvpToEvent } from "@/app/actions/registrations";
import { useAuth } from "@/components/auth/auth-context";
import { NamePrompt } from "@/components/prompts/name-prompt";
import { LogIn } from "lucide-react";

interface RSVPButtonProps {
  eventId: string;
  price?: {
    price?: number;
    priceCurrency?: string;
    url?: string;
    availability?: string;
  };
}

export function RSVPButton({ eventId, price }: RSVPButtonProps) {
  const [loading, setLoading] = useState(false);
  const [registered, setRegistered] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showNamePrompt, setShowNamePrompt] = useState(false);
  const pathname = usePathname();
  const { user, isAuthenticated, isLoading } = useAuth();

  // Track view on mount
  useEffect(() => {
    trackEventView(eventId, user?.id);
  }, [eventId, user?.id]);

  const handleRSVP = async () => {
    if (!isAuthenticated || !user?.id) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // The server action resolves the signed-in person via AuthKit on the
      // server — no access token needs to cross from the client.
      await rsvpToEvent({ eventId });
      setRegistered(true);
    } catch (err) {
      const message =
        err instanceof Error && err.message ? err.message : "Failed to register. Please try again.";
      setError(message);
      console.error("RSVP error:", err);
    } finally {
      setLoading(false);
    }
  };

  // Show loading state while auth is initializing
  if (isLoading) {
    return (
      <Button variant="secondary" className="w-full py-4 text-base" disabled>
        Loading...
      </Button>
    );
  }

  // Show sign in prompt if not authenticated
  if (!isAuthenticated) {
    return (
      <Link href={`/auth/signin?return_to=${encodeURIComponent(pathname)}`}>
        <Button variant="default" className="w-full py-4 text-base">
          <LogIn className="w-5 h-5 mr-2" />
          Sign in to RSVP
        </Button>
      </Link>
    );
  }

  // Show name prompt for authenticated users without a name
  if (isAuthenticated && (!user?.name || user.name === "User")) {
    if (showNamePrompt) {
      return (
        <div className="space-y-2">
          <NamePrompt onComplete={handleRSVP} />
        </div>
      );
    }
    return (
      <Button
        variant="default"
        className="w-full py-4 text-base"
        onClick={() => setShowNamePrompt(true)}
      >
        {price ? "Get Tickets" : "RSVP Now"}
      </Button>
    );
  }

  if (registered) {
    return (
      <Button variant="secondary" className="w-full py-4 text-base" disabled>
        Registered
      </Button>
    );
  }

  return (
    <div>
      <Button
        variant="default"
        className="w-full py-4 text-base"
        onClick={handleRSVP}
        disabled={loading}
      >
        {loading ? "Registering..." : price ? "Get Tickets" : "RSVP Now"}
      </Button>
      {error && (
        <div className="flex items-center gap-2 mt-2 p-2 bg-red-500/10 rounded-lg">
          <span className="text-red-400 text-sm">{error}</span>
        </div>
      )}
    </div>
  );
}
