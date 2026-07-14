---
name: db-seed-verify
description: Seed an in-memory MongoDB with v3.1 docs and drive nhimbe against it — the mongodb-memory-server-core pattern the calendars lane used to verify SSR without the Mukoko cluster.
---

# db-seed-verify — in-memory Mongo seed-and-drive

The Mukoko cluster is not reachable from a sandbox, and without `MONGODB_URI`
every SSR read degrades to an empty/not-found state. To verify a data-backed
change (a listing, a detail page, a calendar) you seed a throwaway MongoDB and
point the app at it. This is the pattern the calendars lane (NYU-25) used.

## The pattern

1. **Start an in-memory server** with `mongodb-memory-server-core` on a fixed
   port, from a scratch dir (never inside the repo — it must not be committed):

   ```js
   import { MongoMemoryServer } from "mongodb-memory-server-core";
   const mongod = await MongoMemoryServer.create({ instance: { port: 47017 } });
   ```

2. **Seed v3.1 documents** with the official `mongodb` driver. Match the
   conventions the app expects: string-UUID `_id`, `_schemaVersion: "v3.1"`,
   camelCase fields, and **BSON dates** (real `Date` objects, not strings).
   Copy the required fields from `src/lib/mongo/types.ts`, and split documents
   across the same databases the app reads — `events`, `identity`, `entity`,
   `places`, `circles`, … exactly as mapped in `src/lib/mongo/databases.ts`.

3. **Drive the app** against it:

   ```bash
   MONGODB_URI="mongodb://127.0.0.1:47017/" npx next dev -p 11825
   ```

   Use `next dev` (on-demand rendering) to observe SSR reads and routes like
   `sitemap.ts` that prerender empty at build time without Mongo. For
   authenticated flows add `DEV_AUTH_BYPASS=1` (server actions) and
   `NEXT_PUBLIC_DEV_AUTH_BYPASS=1` (client-guarded pages).

## Gotchas

- Seed thoughtfully for **builds**: a published upcoming event breaks
  prerendering `/` (see `release-check`). For a seeded `npm run build`, avoid
  that document shape or expect `/` to render dynamically.
- Streamed dynamic pages return HTTP 200 with the not-found UI (soft-404) —
  check the `<title>`, not the status code.
- SSR text renders with `<!-- -->` separators (e.g. `{count} followers`) —
  strip them (`sed 's/<!-- -->//g'`) before grepping page HTML.

## Related

The **`verify`** skill covers the full sandbox launch recipe (auth bypass,
Playwright driving, more gotchas). This skill is the focused seed-and-drive
core; `release-check` covers the seeded **build** case.
