---
name: create-migration
description: Pointer skill — schema migrations now live in the nyuchi_platform_db repo, not this one
disable-model-invocation: true
allowed-tools: Read
---

Schema migrations are no longer authored in this repository.

## Where they live now

All database schema for the Mukoko platform — including the tables nhimbe reads/writes — is owned by the **`nyuchi_platform_db`** Supabase project. Migrations are SQL files in that repo, applied via:

- **Supabase MCP** — call `apply_migration` from a session that has the Supabase MCP enabled, OR
- **Supabase CLI** — `supabase db push` from inside the `nyuchi_platform_db` repo

## What this repo does

This repo (`nhimbe`) is a pure consumer of the platform DB:

- **Worker side**: `worker/src/db/supabase.ts` (`supabaseFetch()` helper) uses PostgREST + the service-role key.
- **Frontend side**: `src/lib/supabase/` clients use the anon key for RLS-protected reads.
- Row → API mapping for events lives in `worker/src/db/event_mapper.ts`.

## If you really need a schema change

1. Open a PR against `nyuchi_platform_db` with the new migration file (use the create-migration skill in that repo).
2. Once merged + applied, return to this repo and update the consumer code:
   - Add fields to `worker/src/db/event_mapper.ts` if API shapes need to expose them
   - Update `worker/src/types.ts` for any new column types
   - Update `src/lib/supabase/types.ts` if frontend reads them directly
3. Land all consumer changes in a single PR per the Nyuchi "big PR, multiple commits" convention.

## Historical context

Before April 2026 this skill scaffolded D1 SQLite migrations under `worker/src/db/migrations/`. That directory and all 11 D1 migration files were removed in the D1→Supabase migration (see `claude/d1-to-supabase-migration` branch). MongoDB was once "planned future" and has been dropped from the stack entirely.
