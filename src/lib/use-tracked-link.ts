"use client";

import { useEffect, useState } from "react";
import { createTrackedLink, getTrackedUrl } from "@/lib/api";
import { useAuth } from "@/components/auth/auth-context";

/**
 * Hook to create and cache a tracked link for an external URL.
 * Returns the nhimbe redirect URL (/r/[code]) that tracks clicks.
 * Falls back to the raw URL if link creation fails (including when the
 * user isn't signed in — `createTrackedLink` requires a WorkOS JWT now,
 * and unauthenticated visitors should still get a working link).
 */
export function useTrackedLink(
  targetUrl: string | undefined,
  eventId: string,
  linkType: "meeting_url" | "directions" | "ticket" | "website",
): string | undefined {
  const [trackedUrl, setTrackedUrl] = useState<string | undefined>(undefined);
  const { accessToken, getAccessToken, isAuthenticated } = useAuth();

  useEffect(() => {
    if (!targetUrl) return;

    let cancelled = false;

    (async () => {
      if (!isAuthenticated) {
        if (!cancelled) setTrackedUrl(targetUrl);
        return;
      }
      const token = accessToken ?? (await getAccessToken());
      if (!token) {
        if (!cancelled) setTrackedUrl(targetUrl);
        return;
      }

      try {
        const result = await createTrackedLink(
          { targetUrl, eventId, linkType },
          token,
        );
        if (!cancelled) setTrackedUrl(getTrackedUrl(result.code));
      } catch {
        if (!cancelled) setTrackedUrl(targetUrl);
      }
    })();

    return () => { cancelled = true; };
  }, [targetUrl, eventId, linkType, isAuthenticated, accessToken, getAccessToken]);

  return trackedUrl;
}
