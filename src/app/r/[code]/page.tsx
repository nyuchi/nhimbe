import { redirect, notFound } from "next/navigation";
import { getActiveTrackedLinkBySlug, recordTrackedLinkClick } from "@/lib/mongo/tracked-links";

interface RedirectPageProps {
  params: Promise<{ code: string }>;
}

/**
 * Tracked short-link resolver (`/r/<code>`). Reads the tracked link straight
 * from the global engagement substrate (engagement.trackedLinks), records the
 * click best-effort, then 302s to the destination — all server-side, no HTTP
 * hop to an external API. Reader + click helpers are shared with the writer in
 * `@/lib/mongo/tracked-links`.
 *
 * `redirect()` throws internally (NEXT_REDIRECT), so it MUST run outside the
 * try/catch — otherwise the catch swallows the redirect (the bug in the old
 * fetch-based version).
 */
export default async function TrackedRedirectPage({ params }: RedirectPageProps) {
  const { code } = await params;

  let destination: string | null = null;
  try {
    const link = await getActiveTrackedLinkBySlug(code);
    if (link) {
      destination = link.destinationUrl ?? null;
      // Record the click + bump the counter (best-effort; never blocks the redirect).
      await recordTrackedLinkClick(link);
    }
  } catch {
    destination = null;
  }

  if (destination) redirect(destination);
  notFound();
}
