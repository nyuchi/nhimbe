import { redirect, notFound } from "next/navigation";
import { trackedLinksCollection, linkClicksCollection } from "@/lib/mongo/databases";
import { newId, WRITE_SCHEMA_VERSION } from "@/lib/mongo/ids";

interface RedirectPageProps {
  params: Promise<{ code: string }>;
}

/**
 * Tracked short-link resolver (`/r/<code>`). Reads the tracked link straight
 * from the global engagement substrate (engagement.trackedLinks), records the
 * click best-effort, then 302s to the destination — all server-side, no HTTP
 * hop to an external API.
 *
 * `redirect()` throws internally (NEXT_REDIRECT), so it MUST run outside the
 * try/catch — otherwise the catch swallows the redirect (the bug in the old
 * fetch-based version).
 */
export default async function TrackedRedirectPage({ params }: RedirectPageProps) {
  const { code } = await params;

  let destination: string | null = null;
  try {
    const links = await trackedLinksCollection();
    const link = await links.findOne({ linkSlug: code, isActive: true });
    if (link) {
      destination = link.destinationUrl ?? null;
      // Record the click + bump the counter (best-effort; never blocks the redirect).
      await Promise.allSettled([
        links.updateOne({ _id: link._id }, { $inc: { clickCount: 1 }, $set: { updatedAt: new Date() } }),
        linkClicksCollection().then((clicks) =>
          clicks.insertOne({
            _id: newId(),
            _schemaVersion: WRITE_SCHEMA_VERSION,
            createdAt: new Date(),
            trackedLinkId: link._id,
            clickedAt: new Date(),
          }),
        ),
      ]);
    }
  } catch {
    destination = null;
  }

  if (destination) redirect(destination);
  notFound();
}
