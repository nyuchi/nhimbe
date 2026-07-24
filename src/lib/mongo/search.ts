/**
 * Event search over MongoDB Atlas — hybrid (vector + full-text) with graceful
 * degradation.
 *
 * Retrieval tiers, best → fallback, all non-throwing for the expected failure
 * modes (no gateway, missing index):
 *
 *   1. HYBRID  — `$vectorSearch` (semantic) fused with Atlas `$search`
 *      (full-text, typo-tolerant) via Reciprocal Rank Fusion in app code.
 *      Used when BOTH sub-searches return hits.
 *   2. VECTOR  — semantic only, when the text index is absent/empty.
 *   3. TEXT    — Atlas `$search` only, when the gateway/vector index is absent.
 *   4. REGEX   — a plain case-insensitive `$regex` scan (the last resort, needs
 *      no search index at all) so search NEVER hard-fails.
 *
 * Why app-side RRF instead of the native `$rankFusion` stage: `$rankFusion`
 * (which fuses `$vectorSearch` + `$search` inside one pipeline) requires
 * MongoDB 8.1+, and the Mukoko cluster is 8.0.x. Fusing in Node gives the same
 * quality on 8.0; swap to native `$rankFusion` once the cluster is upgraded
 * (see `docs/search-platform-requests.md`).
 *
 * Indexes this expects (owned by the Mukoko platform — created on the cluster,
 * NOT in this repo; see docs/search-platform-requests.md):
 *
 *   Atlas Vector Search — db: events, collection: eventEmbeddings,
 *   index name: "event_vector_index"
 *   {
 *     "fields": [
 *       { "type": "vector", "path": "embedding", "numDimensions": 768,
 *         "similarity": "cosine" },
 *       { "type": "filter", "path": "city" },
 *       { "type": "filter", "path": "category" }
 *     ]
 *   }
 *
 *   Atlas Search (full-text) — db: events, collection: events,
 *   index name: "events_text_index"
 *   {
 *     "mappings": { "dynamic": false, "fields": {
 *       "name":        [ { "type": "string" },
 *                        { "type": "autocomplete", "tokenization": "edgeGram",
 *                          "minGrams": 2, "maxGrams": 15 } ],
 *       "description": { "type": "string" },
 *       "tags":        { "type": "string" }
 *     }}
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
/** Atlas Search (full-text) index name expected on events.events. */
const TEXT_INDEX = "events_text_index";

const PUBLISHED_STATUSES = ["published", "live"];

/** Reciprocal Rank Fusion constant (the industry-standard 60). */
const RRF_K = 60;

export type SearchMode = "hybrid" | "vector" | "text";

export interface SemanticSearchParams {
  query: string;
  limit?: number;
  city?: string;
  category?: string;
}

export interface SemanticSearchResult {
  events: Event[];
  /** How the results were produced — lets the UI label/telemetry differ. */
  mode: SearchMode;
}

/** Keep only events that are publicly listable (published/live, not private). */
function isPubliclyListable(e: Event): boolean {
  return e.isPublished !== false;
}

function clampLimit(limit: number | undefined): number {
  return Math.min(Math.max(limit ?? 20, 1), 50);
}

/**
 * Fuse several ranked id lists into one by Reciprocal Rank Fusion:
 * score(id) = Σ weightᵢ / (K + rankᵢ) with rank 1-based. Higher = better.
 * Exported for unit testing.
 */
export function reciprocalRankFuse(lists: string[][], weights: number[]): string[] {
  const scores = new Map<string, number>();
  lists.forEach((ids, i) => {
    const weight = weights[i] ?? 1;
    ids.forEach((id, index) => {
      scores.set(id, (scores.get(id) ?? 0) + weight / (RRF_K + index + 1));
    });
  });
  return [...scores.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id);
}

/**
 * Hybrid event search (vector ⊕ full-text) with graceful fallback to
 * vector-only, text-only, then a regex scan. Never throws for the common
 * failure modes (no gateway, missing index).
 */
export async function semanticSearchEvents(
  params: SemanticSearchParams,
): Promise<SemanticSearchResult> {
  const query = params.query.trim();
  if (!query) return { events: [], mode: "text" };
  const limit = clampLimit(params.limit);

  // Run the two ranked retrievers concurrently — each returns ordered _ids and
  // never throws (they log + return [] on a missing index / gateway).
  const [vectorIds, textIds] = await Promise.all([
    vectorSearchIds(query, limit, params),
    atlasTextSearchIds(query, limit, params),
  ]);

  // 1. HYBRID — both retrievers produced hits: fuse and hydrate.
  if (vectorIds.length && textIds.length) {
    const fused = reciprocalRankFuse([vectorIds, textIds], [1, 1]).slice(0, limit);
    const events = (await getEventsByIds(fused)).filter(isPubliclyListable);
    if (events.length) return { events, mode: "hybrid" };
  }

  // 2. VECTOR-only.
  if (vectorIds.length) {
    const events = (await getEventsByIds(vectorIds)).filter(isPubliclyListable);
    if (events.length) return { events, mode: "vector" };
  }

  // 3. Atlas full-text only.
  if (textIds.length) {
    const events = (await getEventsByIds(textIds)).filter(isPubliclyListable);
    if (events.length) return { events, mode: "text" };
  }

  // 4. REGEX scan — needs no search index.
  return { events: await regexSearch(query, limit, params), mode: "text" };
}

/** Embed the query and run `$vectorSearch`; returns ranked _ids ([] on failure). */
async function vectorSearchIds(
  query: string,
  limit: number,
  params: SemanticSearchParams,
): Promise<string[]> {
  if (!isGatewayConfigured()) return [];
  try {
    const vector = await embedOne(query);
    if (!vector || vector.length !== EMBEDDING_DIMENSIONS) return [];

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
    return matches.map((m) => m._id);
  } catch (err) {
    console.warn("[shamwari] vector search unavailable, degrading:", err);
    return [];
  }
}

/**
 * Atlas `$search` full-text with typo tolerance (`fuzzy`). Returns ranked _ids,
 * or [] when the text index is absent (a plain regex scan then covers it).
 */
async function atlasTextSearchIds(
  query: string,
  limit: number,
  params: SemanticSearchParams,
): Promise<string[]> {
  try {
    const match: Record<string, unknown> = {
      status: { $in: PUBLISHED_STATUSES },
      "mukoko.visibility": { $ne: "private" },
    };
    if (params.city) match["location.addressLocality"] = params.city;
    if (params.category) match.tags = params.category;

    const col = await eventsCollection();
    const docs = await col
      .aggregate<{ _id: string }>([
        {
          $search: {
            index: TEXT_INDEX,
            text: {
              query,
              path: ["name", "description", "tags"],
              fuzzy: { maxEdits: 2, prefixLength: 1 },
            },
          },
        },
        // Drop unpublished/private AFTER ranking, then cap.
        { $match: match },
        { $limit: limit },
        { $project: { _id: 1 } },
      ])
      .toArray();
    return docs.map((d) => d._id);
  } catch (err) {
    console.warn("[shamwari] atlas $search unavailable, will use regex fallback:", err);
    return [];
  }
}

/** Regex fallback across name/description/tags with the same filters. */
async function regexSearch(
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

/**
 * Type-ahead suggestions for the search box: event-name prefixes. Uses the
 * Atlas Search `autocomplete` operator (edge n-grams + typo tolerance) when the
 * text index is present, else a case-insensitive name-prefix regex. Returns a
 * de-duplicated list of event names; never throws.
 */
export async function autocompleteEventNames(prefix: string, limit = 6): Promise<string[]> {
  const q = prefix.trim();
  if (q.length < 2) return [];
  const cap = Math.min(Math.max(limit, 1), 10);

  const match = {
    status: { $in: PUBLISHED_STATUSES },
    "mukoko.visibility": { $ne: "private" },
  };
  const col = await eventsCollection();

  try {
    const docs = await col
      .aggregate<{ name: string }>([
        {
          $search: {
            index: TEXT_INDEX,
            autocomplete: { query: q, path: "name", fuzzy: { maxEdits: 1, prefixLength: 1 } },
          },
        },
        { $match: match },
        { $limit: cap },
        { $project: { _id: 0, name: 1 } },
      ])
      .toArray();
    const names = dedupeNames(docs.map((d) => d.name));
    if (names.length) return names;
  } catch (err) {
    console.warn("[shamwari] autocomplete $search unavailable, using regex:", err);
  }

  // Regex prefix fallback (anchored, escaped).
  const safe = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const docs = await col
    .find({ ...match, name: { $regex: `^${safe}`, $options: "i" } } as Parameters<
      typeof col.find
    >[0])
    .limit(cap)
    .project({ _id: 0, name: 1 })
    .toArray();
  return dedupeNames(docs.map((d) => (d as { name: string }).name));
}

function dedupeNames(names: (string | undefined)[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const name of names) {
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(name);
  }
  return out;
}
