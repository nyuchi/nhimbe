/**
 * Tracked short-links — writer + reader over the shared engagement substrate.
 *
 * `engagement.trackedLinks` is a GLOBAL Mukoko collection: a tracked link is a
 * short `linkSlug` (resolved at `/r/<slug>`) that 302s to `destinationUrl` and
 * counts clicks into `engagement.linkClicks`. nhimbe creates one when a host
 * shares an outbound event link (meeting URL, directions, tickets, website) so
 * the click-through shows up in analytics.
 *
 * This module owns both ends: the writer (`createTrackedLink`) that the share
 * flow calls through a server action, and the read/click helpers the
 * `/r/[code]` resolver uses. Follows Mukoko v3.1 conventions via `stampNew`
 * (string-UUID `_id`, `_schemaVersion`, camelCase, BSON dates).
 *
 * Server-only: pulls the Mongo collection accessors.
 */

import "server-only";
import { trackedLinksCollection, linkClicksCollection } from "./databases";
import { stampNew, newId, shortLinkSlug, WRITE_SCHEMA_VERSION } from "./ids";
import type { TrackedLinkDoc } from "./types";

/** http(s)-only URL check — rejects javascript:, data:, and malformed URLs. */
export function isHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

export interface CreateTrackedLinkInput {
  /** The outbound URL the short-link resolves to (must be http/https). */
  destinationUrl: string;
  /** Person that owns the link (`identity.persons._id`). */
  ownerPersonId: string;
  /** Entity the owner acts through (`entity.entities._id`). */
  ownerEntityId: string;
  /** Event the link is shared from — recorded as analytics context. */
  eventId?: string | null;
  /** What kind of outbound link this is — analytics context. */
  linkType?: "meeting_url" | "directions" | "ticket" | "website" | null;
}

/** Number of slug-collision retries before giving up (astronomically unlikely). */
const MAX_SLUG_ATTEMPTS = 5;

/**
 * Build the `engagement.trackedLinks` document body for an insert. Pure (no
 * DB): the event/link-type context lives under the free-form `utm` bag rather
 * than inventing top-level fields the shared validator would reject.
 */
export function buildTrackedLinkDoc(input: CreateTrackedLinkInput, slug: string): TrackedLinkDoc {
  const utm: Record<string, unknown> = { source: "nhimbe" };
  if (input.eventId) utm.eventId = input.eventId;
  if (input.linkType) utm.linkType = input.linkType;

  return {
    ...stampNew(),
    linkSlug: slug,
    destinationUrl: input.destinationUrl,
    ownerPersonId: input.ownerPersonId,
    ownerEntityId: input.ownerEntityId,
    clickCount: 0,
    isActive: true,
    utm,
  };
}

/**
 * Create a tracked link and return its slug. Retries on the (vanishingly rare)
 * slug collision. Throws for a non-http(s) destination — callers should treat a
 * throw as "fall back to the raw URL".
 */
export async function createTrackedLink(input: CreateTrackedLinkInput): Promise<TrackedLinkDoc> {
  if (!isHttpUrl(input.destinationUrl)) {
    throw new Error("A tracked link needs a valid http(s) destination.");
  }
  const col = await trackedLinksCollection();

  let lastErr: unknown;
  for (let attempt = 0; attempt < MAX_SLUG_ATTEMPTS; attempt++) {
    const doc = buildTrackedLinkDoc(input, shortLinkSlug());
    try {
      await col.insertOne(doc);
      return doc;
    } catch (err) {
      // 11000 == duplicate key (slug already taken); retry with a fresh slug.
      const code = (err as { code?: number })?.code;
      if (code === 11000) {
        lastErr = err;
        continue;
      }
      throw err;
    }
  }
  throw lastErr ?? new Error("Could not allocate a unique tracked-link slug.");
}

/** Resolve an active tracked link by its public slug (used by `/r/[code]`). */
export async function getActiveTrackedLinkBySlug(slug: string): Promise<TrackedLinkDoc | null> {
  const col = await trackedLinksCollection();
  return col.findOne({ linkSlug: slug, isActive: true });
}

/**
 * Record a click against a tracked link: bump the counter and append a
 * `linkClicks` row. Best-effort — never throws (the caller redirects
 * regardless), and both writes settle independently.
 */
export async function recordTrackedLinkClick(
  link: Pick<TrackedLinkDoc, "_id">,
  meta: { referrer?: string | null; clickerPersonId?: string | null } = {},
): Promise<void> {
  const [links, clicks] = await Promise.all([trackedLinksCollection(), linkClicksCollection()]);
  await Promise.allSettled([
    links.updateOne({ _id: link._id }, { $inc: { clickCount: 1 }, $set: { updatedAt: new Date() } }),
    clicks.insertOne({
      _id: newId(),
      _schemaVersion: WRITE_SCHEMA_VERSION,
      createdAt: new Date(),
      trackedLinkId: link._id,
      clickedAt: new Date(),
      referrer: meta.referrer ?? null,
      clickerPersonId: meta.clickerPersonId ?? null,
    }),
  ]);
}
