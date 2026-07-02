"use server";

/**
 * Programme (event-specifics) read server action — Vercel server runtime → MongoDB.
 *
 * Replaces the old browser-side Supabase read of `events.programme_item`
 * (publishable-key client) with a Node-runtime Server Action that reads
 * `events.programmeItems` (Mukoko v3.1). The browser never touches Mongo, so
 * the EventSpecifics card calls this action instead of querying PostgREST
 * directly.
 *
 * Programme items are public, schedule-style metadata surfaced on the public
 * event detail page (lineup / order of service / menu / schedule), so this read
 * is unauthenticated by design — it mirrors the previous RLS-public policy.
 * Performer labels are resolved from `performerEntityIds` → `entity.entities`
 * in a single batched `$in` query to avoid N+1 fan-out.
 */

import "server-only";
import { entitiesCollection, programmeItemsCollection } from "@/lib/mongo/databases";
import type { ProgrammeItemDoc } from "@/lib/mongo/types";

/**
 * UI shape consumed by EventSpecifics. Intentionally serialisable (ISO strings,
 * no BSON) so it can cross the Server Action boundary to the client component.
 */
export interface ProgrammeItem {
  id: string;
  /** Ordering position (the v3.1 `sequence`). */
  position: number | null;
  name: string;
  description: string | null;
  /** ISO 8601 start instant, or null. */
  startDate: string | null;
  /** ISO 8601 end instant, or null. */
  endDate: string | null;
  /** Resolved performer display name, when the item references an entity. */
  performer: string | null;
  /** Track/grouping label, when present. */
  track: string | null;
}

/** ISO-or-null helper for serialising BSON dates across the action boundary. */
function isoOrNull(value: Date | null | undefined): string | null {
  if (!value) return null;
  const time = value.getTime();
  return Number.isNaN(time) ? null : value.toISOString();
}

/**
 * List the programme items for an event, ordered by sequence then start time.
 * Returns an empty array when the event has no programme — the EventSpecifics
 * slot collapses cleanly in that case.
 */
export async function listProgrammeItems(eventId: string): Promise<ProgrammeItem[]> {
  const id = eventId?.trim();
  if (!id) return [];

  const col = await programmeItemsCollection();
  const docs = await col
    .find({ eventId: id })
    .sort({ sequence: 1, startTime: 1 })
    .toArray();
  if (docs.length === 0) return [];

  // Resolve performer display names in one batched query (avoids N+1).
  const performerIds = [
    ...new Set(docs.flatMap((d) => d.performerEntityIds ?? []).filter((v): v is string => !!v)),
  ];
  const entityNameById = new Map<string, string>();
  if (performerIds.length > 0) {
    const entities = await (await entitiesCollection())
      .find({ _id: { $in: performerIds } })
      .toArray();
    for (const e of entities) entityNameById.set(e._id, e.name);
  }

  return docs.map((doc) => toProgrammeItem(doc, entityNameById));
}

function toProgrammeItem(
  doc: ProgrammeItemDoc,
  entityNameById: Map<string, string>,
): ProgrammeItem {
  const firstPerformerId = doc.performerEntityIds?.find((pid) => entityNameById.has(pid));
  return {
    id: doc._id,
    position: typeof doc.sequence === "number" ? doc.sequence : null,
    name: doc.name,
    description: doc.description ?? null,
    startDate: isoOrNull(doc.startTime),
    endDate: isoOrNull(doc.endTime),
    performer: firstPerformerId ? (entityNameById.get(firstPerformerId) ?? null) : null,
    track: doc.trackName ?? null,
  };
}
