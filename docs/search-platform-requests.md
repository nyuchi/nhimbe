# Search — Mukoko platform requests

Nhimbe's search is being upgraded to hybrid (semantic vector + typo-tolerant
full-text). The app-side work ships in this repo and **degrades gracefully**:
if the indexes below don't exist yet, search silently falls back
(vector → Atlas `$search` → regex scan), so nothing breaks. But the quality
wins only turn on once the Mukoko platform team creates the indexes (and,
later, upgrades the cluster). MongoDB collections/validators/indexes are owned
by the platform, not this repo — hence these requests.

Cluster observed at time of writing: **MongoDB 8.0.28 Enterprise**.

## 1. Create the Atlas Vector Search index (unblocks semantic search — highest priority)

The code already targets this exact index; it does not currently exist on the
cluster, so semantic search is dormant and every query falls back to text.

- **Database / collection:** `events` / `eventEmbeddings`
- **Index name:** `event_vector_index`
- **Definition:**

```json
{
  "fields": [
    { "type": "vector", "path": "embedding", "numDimensions": 768, "similarity": "cosine" },
    { "type": "filter", "path": "city" },
    { "type": "filter", "path": "category" }
  ]
}
```

768 dimensions / cosine matches the current embedding model (Cloudflare BGE
`@cf/baai/bge-base-en-v1.5`). After creation, the app should backfill
embeddings for existing events (per-event indexing already runs on
create/edit via `src/lib/ai/event-index.ts`; a one-off backfill over the
catalogue is needed for events created before indexing existed).

## 2. Create the Atlas Search (full-text) index (unblocks typo tolerance + autocomplete)

Enables ranked full-text search (`$search` with `fuzzy`) and the search-box
autocomplete, replacing the regex scan.

- **Database / collection:** `events` / `events`
- **Index name:** `events_text_index`
- **Definition:**

```json
{
  "mappings": {
    "dynamic": false,
    "fields": {
      "name": [
        { "type": "string" },
        { "type": "autocomplete", "tokenization": "edgeGram", "minGrams": 2, "maxGrams": 15 }
      ],
      "description": { "type": "string" },
      "tags": { "type": "string" }
    }
  }
}
```

Consumed by `atlasTextSearchIds` and `autocompleteEventNames` in
`src/lib/mongo/search.ts`.

## 3. (Later) Upgrade the cluster to MongoDB 8.1+ for native `$rankFusion`

We currently fuse the vector and full-text result lists **in application code**
(Reciprocal Rank Fusion, `reciprocalRankFuse` in `src/lib/mongo/search.ts`)
because the native `$rankFusion` aggregation stage — which fuses `$vectorSearch`
and `$search` in one pipeline — **requires MongoDB 8.1+**, and the cluster is
8.0.x. Once upgraded, the app-side fusion can be swapped for a single
`$rankFusion` pipeline (same result contract; a localized change in
`search.ts`). No app change is needed to benefit from the upgrade itself — this
is purely to enable the later simplification.

## 4. (Optional, later) Automated embeddings (Voyage AI)

Atlas now offers **Automated Embedding** (Voyage AI) in public preview: you
store/query text and the database generates + syncs the vectors, removing the
Cloudflare embedding call on both write and query paths. Adopting it would
require enabling the preview feature on the cluster, a **new** vector index
(Voyage models use different dimensions, e.g. 1024, not 768), and a full
re-embed. Treat as a deliberate future migration, not a quick win.

---

**Summary for the platform team:** (1) create `event_vector_index` and
(2) `events_text_index` now — these two unblock the shipped app-side search.
(3) schedule the 8.1 upgrade and (4) evaluate automated embeddings later.
