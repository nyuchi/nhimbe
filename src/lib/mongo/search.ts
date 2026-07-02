/**
 * Semantic event search over MongoDB Atlas Vector Search.
 *
 * Flow: embed the query on the Shamwari gateway (BGE) → `$vectorSearch` against
 * the `events.eventEmbeddings` collection → hydrate the winning events with
 * their host/venue relations (`getEventsByIds`) → drop anything not publicly
 * listable. When the gateway is unconfigured or the vector index is missing,
 * we fall back to a regex text scan so search never hard-fails.
 *
 * The Atlas Vector Search index this expects (create once on the cluster):
 *
 *   db: events, collection: eventEmbeddings, index name: "event_vector_index"
 *   {
 *     "fields": [
 *       { "type": "vector", "path": "embedding", "numDimensions": 768,
 *         "similarity": "cosine" },
 *       { "type": "filter", "path": "city" },
 *       { "type": "filter", "path": "category" }
 *     ]
 *   }
 */

import "server-only";
import { embedOne, EMBEDDING_DIMENSIONS, isGatewayConfigured } from "@/lib/ai/gateway";
import { eventEmbeddingsCollection, eventsCollection } from "./databases";
import { getEventsByIds } from "./events";
import type { EventDoc } from "./types";
import type { Event } from "@/lib/api";

/** Atlas Vector Search index name expected on events.eventEmbeddings. */
const VECTOR_INDEX = "event_vector_index";

const PUBLISHED_STATUSES = ["published", "live"];

export interface SemanticSearchParams {
  query: string;
  limit?: number;
  city?: string;
  category?: string;
}

export interface SemanticSearchResult {
  events: Event[];
  /** How the results were produced — lets the UI label/telemetry differ. */
  mode: "vector" | "text";
}

/** Keep only events that are publicly listable (published/live, not private). */
function isPubliclyListable(e: Event): boolean {
  return e.isPublished !== false;
}

/**
 * Vector-first event search with a regex text fallback. Never throws for the
 * common failure modes (no gateway, no index) — it degrades to text search.
 */
export async function semanticSearchEvents(
  params: SemanticSearchParams,
): Promise<SemanticSearchResult> {
  const query = params.query.trim();
  if (!query) return { events: [], mode: "text" };
  const limit = Math.min(Math.max(params.limit ?? 20, 1), 50);

  if (isGatewayConfigured()) {
    try {
      const vector = await embedOne(query);
      if (vector && vector.length === EMBEDDING_DIMENSIONS) {
        const events = await vectorSearch(vector, limit, params);
        // Only trust vector results when the index actually returned something;
        // an empty result can mean "no index yet", so fall through to text.
        if (events.length > 0) return { events, mode: "vector" };
      }
    } catch (err) {
      console.warn("[shamwari] vector search failed, falling back to text:", err);
    }
  }

  return { events: await textSearch(query, limit, params), mode: "text" };
}

/** Run the Atlas `$vectorSearch` pipeline and hydrate the matches. */
async function vectorSearch(
  vector: number[],
  limit: number,
  params: SemanticSearchParams,
): Promise<Event[]> {
  const filter: Record<string, unknown> = {};
  if (params.city) filter.city = params.city;
  if (params.category) filter.category = params.category;

  const col = await eventEmbeddingsCollection();
  const matches = await col
    .aggregate<{ _id: string }>([
      {
        $vectorSearch: {
          index: VECTOR_INDEX,
          path: "embedding",
          queryVector: vector,
          numCandidates: Math.max(limit * 10, 100),
          limit,
          ...(Object.keys(filter).length ? { filter } : {}),
        },
      },
      { $project: { _id: 1 } },
    ])
    .toArray();

  const ids = matches.map((m) => m._id);
  const events = await getEventsByIds(ids); // preserves vector rank order
  return events.filter(isPubliclyListable);
}

/** Regex fallback across name/description/tags with the same filters. */
async function textSearch(
  query: string,
  limit: number,
  params: SemanticSearchParams,
): Promise<Event[]> {
  // Escape regex metacharacters so user input is treated literally.
  const safe = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const rx = { $regex: safe, $options: "i" };

  const filter: Record<string, unknown> = {
    status: { $in: PUBLISHED_STATUSES },
    "mukoko.visibility": { $ne: "private" },
    $or: [{ name: rx }, { description: rx }, { tags: rx }],
  };
  if (params.city) filter["location.addressLocality"] = params.city;
  if (params.category) filter.tags = params.category;

  const col = await eventsCollection();
  const docs = await col
    .find(filter as Parameters<typeof col.find>[0])
    .sort({ startDate: 1 })
    .limit(limit)
    .toArray();

  const events = await getEventsByIds(docs.map((d: EventDoc) => d._id));
  return events.filter(isPubliclyListable);
}
