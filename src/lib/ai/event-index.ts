/**
 * Event embedding indexing for RAG (Atlas Vector Search).
 *
 * When an event is created or edited we embed a compact text representation of
 * it (via the Shamwari gateway's BGE model) and upsert the vector into the
 * `events.eventEmbeddings` collection. Atlas Vector Search indexes that
 * collection; `src/lib/mongo/search.ts` queries it.
 *
 * Every function here is BEST-EFFORT: indexing must never block or fail an
 * event write. Callers should not await this on the critical path (or should
 * swallow errors) — a missing embedding just means the event won't surface in
 * semantic results until it's re-indexed.
 */

import "server-only";
import { embedOne, isGatewayConfigured } from "@/lib/ai/gateway";
import { eventEmbeddingsCollection } from "@/lib/mongo/databases";
import { WRITE_SCHEMA_VERSION } from "@/lib/mongo/ids";
import type { EventDoc } from "@/lib/mongo/types";

/** Pull the city out of the event's embedded schema.org location object. */
function cityOf(doc: Pick<EventDoc, "location">): string | null {
  const loc = doc.location as Record<string, unknown> | null | undefined;
  if (!loc) return null;
  const address = loc.address as Record<string, unknown> | undefined;
  const city = address?.addressLocality ?? loc.addressLocality;
  return typeof city === "string" && city ? city : null;
}

/** Compose the text we embed — name, description, tags, city. Keeps it short. */
export function buildEventEmbeddingText(
  doc: Pick<EventDoc, "name" | "description" | "tags" | "location">,
): string {
  const tags = (doc.tags ?? []).filter((t): t is string => typeof t === "string");
  const city = cityOf(doc);
  return [
    doc.name,
    doc.description ?? "",
    tags.length ? `Tags: ${tags.join(", ")}` : "",
    city ? `Location: ${city}` : "",
  ]
    .filter(Boolean)
    .join("\n")
    .slice(0, 4000);
}

/**
 * Embed an event and upsert its vector. Returns true on success, false when the
 * gateway is unconfigured or the call failed (never throws).
 */
export async function indexEventEmbedding(
  doc: Pick<EventDoc, "_id" | "name" | "description" | "tags" | "location" | "startDate" | "mukoko">,
): Promise<boolean> {
  if (!isGatewayConfigured()) return false;
  try {
    const sourceText = buildEventEmbeddingText(doc);
    const embedding = await embedOne(sourceText);
    if (!embedding) return false;

    const category =
      typeof doc.mukoko?.category === "string" ? (doc.mukoko.category as string) : null;

    const col = await eventEmbeddingsCollection();
    const now = new Date();
    await col.updateOne(
      { _id: doc._id },
      {
        $set: {
          embedding,
          sourceText,
          city: cityOf(doc),
          category,
          startDate: doc.startDate ?? null,
          updatedAt: now,
        },
        // `_id` is the filter, so Mongo sets it on insert automatically; keep it
        // out of $setOnInsert to avoid an immutable-field conflict.
        $setOnInsert: { _schemaVersion: WRITE_SCHEMA_VERSION, createdAt: now },
      },
      { upsert: true },
    );
    return true;
  } catch (err) {
    console.warn("[shamwari] event embedding index failed:", err);
    return false;
  }
}

/** Best-effort removal of an event's embedding (e.g. on delete). Never throws. */
export async function removeEventEmbedding(eventId: string): Promise<void> {
  try {
    const col = await eventEmbeddingsCollection();
    await col.deleteOne({ _id: eventId });
  } catch (err) {
    console.warn("[shamwari] event embedding removal failed:", err);
  }
}
