---
name: create-migration
description: Pointer skill — the MongoDB schema is owned by the nyuchi_platform_db project, not this repo
disable-model-invocation: true
allowed-tools: Read
---

Database schema is not authored in this repository.

## Where the schema lives

nhimbe stores its data in **MongoDB** (the Mukoko v3.1 cluster). The
collections, JSON-Schema validators, and indexes are owned by the
**`nyuchi_platform_db`** project — shared across all Mukoko products — not by
this repo. Schema/validator changes are made there, or directly against the
cluster with the **MongoDB MCP** (`collMod`, `createCollection`,
`createIndex`, `createSearchIndex`, …) from a session that has it enabled.

There are **no SQL migrations** here. Supabase/Postgres/PostgREST and the old
Cloudflare D1 SQLite migrations were all removed — MongoDB is the only data
store now.

## What this repo does

`nhimbe` is a pure **consumer** of the platform schema. All data access is
server-side via the official `mongodb` driver in `src/lib/mongo/`:

- `client.ts` — cached `MongoClient` (`server-only`)
- `databases.ts` — the `DB` database-name map + typed collection accessors
- `types.ts` — TypeScript document models mirroring the v3.1 validators
- `events.ts` / `lookups.ts` / `engagement.ts` / `stats.ts` / `entities.ts` /
  `users.ts` / `search.ts` / `mappers.ts` — reads/writes + doc → API mapping

## If you need a schema change

1. Make it in `nyuchi_platform_db` (or via the MongoDB MCP `collMod` /
   `createCollection` against the cluster) — this repo can't change validators.
2. Then update the consumer code here:
   - Add/adjust the doc type in `src/lib/mongo/types.ts`
   - Update the relevant `src/lib/mongo/*` reads/writes and `mappers.ts`
3. Land the consumer changes in a single PR (Nyuchi "big PR, multiple commits").

## Notes

- The Atlas Vector Search index used by AI retrieval
  (`events.eventEmbeddings` / `event_vector_index`, 768-dim cosine) is created
  on the cluster, not in code — see `src/lib/mongo/search.ts`.
