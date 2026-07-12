"use client";

import { useEffect, useState } from "react";
import { createTrackedLinkAction, type TrackedLinkType } from "@/app/actions/tracked-links";
import { useAuth } from "@/components/auth/auth-context";

/**
 * Hook to create and cache a tracked link for an external URL.
 * Returns the nhimbe redirect URL (/r/[code]) that tracks clicks.
 *
 * Identity is resolved server-side by the action (AuthKit / dev bypass), so the
 * client no longer forwards a WorkOS token. Falls back to the raw URL whenever a
 * tracked link can't be created — signed-out visitors, a non-http(s) target, or
 * a write failure — so the link always works.
 */
export function useTrackedLink(
  targetUrl: string | undefined,
  eventId: string,
  linkType: TrackedLinkType,
): string | undefined {
  const [trackedUrl, setTrackedUrl] = useState<string | undefined>(undefined);
  const { isAuthenticated } = useAuth();

  useEffect(() => {
    if (!targetUrl) return;

    let cancelled = false;

    // Anonymous visitors can't own a tracked link — use the raw URL directly and
    // skip the server round-trip entirely.
    if (!isAuthenticated) {
      setTrackedUrl(targetUrl);
      return;
    }

    (async () => {
      try {
        const result = await createTrackedLinkAction({ targetUrl, eventId, linkType });
        if (cancelled) return;
        if (result) {
          const origin = typeof window !== "undefined" ? window.location.origin : "";
          setTrackedUrl(`${origin}/r/${result.slug}`);
        } else {
          setTrackedUrl(targetUrl);
        }
      } catch {
        if (!cancelled) setTrackedUrl(targetUrl);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [targetUrl, eventId, linkType, isAuthenticated]);

  return trackedUrl;
}
