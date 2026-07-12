"use server";

/**
 * Tracked-link server action (Vercel server runtime → MongoDB).
 *
 * Replaces the retired `POST /api/links` worker route that `@/lib/api`'s
 * `createTrackedLink` called — that handler no longer exists, so authenticated
 * share flows were counting clicks into a 404 and always falling back to the
 * raw URL. This resolves the acting person via AuthKit, ensures they have a
 * host entity to own the link (Rule 10), and writes one engagement.trackedLinks
 * document through the shared writer.
 *
 * Identity is resolved server-side — the client no longer plumbs a WorkOS
 * bearer token through. Anonymous callers get `null`, and the hook falls back
 * to the raw destination URL.
 */

import { resolveActingPerson } from "@/lib/auth/current-person";
import { ensureHostEntityForPerson } from "@/lib/mongo/entities";
import { getOrCreateTrackedLink, isHttpUrl } from "@/lib/mongo/tracked-links";
import { trackError } from "@/lib/observability";

export type TrackedLinkType = "meeting_url" | "directions" | "ticket" | "website";

export interface CreateTrackedLinkActionInput {
  targetUrl: string;
  eventId: string;
  linkType: TrackedLinkType;
}

export interface TrackedLinkResult {
  /** Public slug resolved at `/r/<slug>`. */
  slug: string;
}

/**
 * Create a tracked link for an outbound event URL. Returns the slug, or `null`
 * when the caller is anonymous or the URL is not http(s) — the caller then uses
 * the raw URL. Never throws for the anonymous / bad-URL cases; genuine write
 * failures are logged and surface as `null` so the UI degrades gracefully.
 */
export async function createTrackedLinkAction(
  input: CreateTrackedLinkActionInput,
): Promise<TrackedLinkResult | null> {
  const targetUrl = input.targetUrl?.trim() ?? "";
  if (!targetUrl || !isHttpUrl(targetUrl)) return null;

  const person = await resolveActingPerson();
  if (!person) return null;

  try {
    const ownerEntityId = await ensureHostEntityForPerson(person);
    const link = await getOrCreateTrackedLink({
      destinationUrl: targetUrl,
      ownerPersonId: person._id,
      ownerEntityId,
      eventId: input.eventId || null,
      linkType: input.linkType,
    });
    return { slug: link.linkSlug };
  } catch (err) {
    trackError(err, {
      module: "tracked-links",
      data: { eventId: input.eventId, linkType: input.linkType },
    });
    return null;
  }
}
