---
name: verify
description: Runtime-verify nhimbe changes in a sandbox without the Mukoko cluster — launch recipe, in-memory Mongo seeding, dev auth bypass, and known gotchas.
---

# Verifying nhimbe at runtime (sandbox, no cluster)

## Launch

- Production: `npm run build && npx next start -p 11825`. Dev (on-demand
  rendering — needed to observe `sitemap.ts` etc., which prerender empty at
  build without Mongo): `npx next dev -p 11825`.
- Without `MONGODB_URI`, every SSR read degrades (empty sections / not-found
  UIs / 500 on API routes) — that IS the contract to observe, not a failure.

## Real data: in-memory MongoDB

No cluster is reachable from the sandbox. Use `mongodb-memory-server-core`
(scratch dir, not the repo): create a server on a fixed port, seed v3.1 docs
(string-UUID `_id`, `_schemaVersion: "v3.1"`, BSON dates — copy required
fields from `src/lib/mongo/types.ts`), then launch the app with
`MONGODB_URI="mongodb://127.0.0.1:<port>/"`. Databases are split
(`events`, `identity`, `entity`, …) exactly as in `src/lib/mongo/databases.ts`.

## Authenticated flows

`DEV_AUTH_BYPASS=1` unlocks server actions (dev person is lazily synced into
`identity.persons`); **client-guarded pages** (create wizard, my-events) also
need `NEXT_PUBLIC_DEV_AUTH_BYPASS=1` or the AuthGuard redirects to
`/auth/hosted` (which 503s without WorkOS env). Both only work under
`next dev`, never `next start`.

Drive the browser with `playwright-core` + the pre-installed Chromium at
`/opt/pw-browsers/chromium` (`chromium.launch({ executablePath })`).

## Gotchas

- Streamed dynamic pages return HTTP 200 with the not-found UI (soft-404) —
  pre-existing app-wide behavior (`/circles/not-a-uuid` too); check the
  `<title>`, not the status code.
- SSR text like `{count} followers` renders with `<!-- -->` separators —
  `sed 's/<!-- -->//g'` before grepping page HTML.
- AuthKit's `getAuthAction` POSTs 500 on every page load without WorkOS env —
  pre-existing sandbox noise, not a finding.
- `npm run build` with a reachable Mongo containing a published upcoming event
  fails prerendering `/` ("Functions cannot be passed to Client Components") —
  pre-existing on main; build without `MONGODB_URI` to avoid it.
