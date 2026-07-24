# nhimbe-mcp

The **nhimbe MCP server** — a task-based [Model Context Protocol](https://modelcontextprotocol.io)
server, and the only thing that runs on Cloudflare Workers. It owns no data:
every tool reads and writes through the nhimbe app API. Everything else
(events, auth, email, AI) lives on the Vercel app.

## Protocol support (dual-era)

The server speaks two MCP protocol eras on the same `/mcp` endpoint, the
pattern the 2026-07-28 revision calls a **dual-era server**. A request selects
its era by how it presents: modern per-request `_meta` (or a modern
`MCP-Protocol-Version` header) → modern semantics; everything else — including
`initialize` — → legacy semantics.

| Era    | Revisions                              | Status | Surface |
| ------ | -------------------------------------- | ------ | ------- |
| Modern | `2026-07-28`                           | **BETA** — built against the [release candidate](https://blog.modelcontextprotocol.io/posts/2026-07-28-release-candidate/); final spec expected 2026-07-28 | `server/discover`, `tools/list`, `tools/call` |
| Legacy | `2025-06-18`, `2025-03-26`, `2024-11-05` | stable | `initialize`, `notifications/initialized`, `ping`, `tools/list`, `tools/call` |

Modern-era behavior (`worker/src/mcp/server.ts` + `versions.ts`):

- **Stateless core** — no handshake; every request carries
  `io.modelcontextprotocol/protocolVersion` / `clientInfo` /
  `clientCapabilities` in `params._meta`. Results carry
  `resultType: "complete"` and `io.modelcontextprotocol/serverInfo` in `_meta`.
- **`server/discover`** — advertises `supportedVersions`, capabilities,
  instructions, and cache hints (`ttlMs`/`cacheScope`, also on `tools/list`).
- **Version negotiation** — an unsupported `_meta` version gets
  `UnsupportedProtocolVersionError` (`-32022`, HTTP 400) with the `supported`
  list; legacy `initialize` now negotiates against the legacy list instead of
  echoing whatever was requested.
- **Request-metadata headers** — `MCP-Protocol-Version`, `Mcp-Method` and (on
  `tools/call`) `Mcp-Name` are required and validated against the body,
  including the `=?base64?…?=` sentinel encoding; mismatches get
  `HeaderMismatch` (`-32020`, HTTP 400). Unknown modern methods get `-32601`
  with HTTP 404. Batches are rejected under modern semantics (kept, leniently,
  for legacy).

Deliberate scope decisions for the beta:

- **MCP Apps extension** — evaluated, deferred. Full adoption needs a `ui://`
  resource served via `resources/read` plus the postMessage app protocol
  inside the HTML; our per-result inline HTML (`render.ts`, data baked in) is
  a different architecture. Results keep the embedded `text/html` resource +
  text fallback; revisit once the final extension spec and host support settle.
- **Tasks extension** — not adopted; every tool is a fast, synchronous
  request/response, so task handles add nothing.
- **Authorization** — the 2026-07-28 OAuth changes (RFC 9207 `iss`
  validation, DCR `application_type`, issuer-keyed credentials, Client ID
  Metadata Documents) all bind on MCP *clients* and authorization servers.
  The worker is neither: it passes the caller's WorkOS bearer token through
  to the app, which verifies it (`src/lib/auth/workos-token.ts`). No change.

## Endpoints

| Method | Path   | Purpose                                             |
| ------ | ------ | --------------------------------------------------- |
| `POST` | `/mcp` | MCP JSON-RPC (Streamable HTTP, stateless)           |
| `GET`  | `/mcp` | 405 — the server is stateless (no SSE stream)       |
| `GET`  | `/`    | status / discovery JSON                             |

## Tools

Task-based, not a CRUD mirror. Every result carries **inline HTML** (a carousel
for several events, a card for one) plus a plain-text fallback.

| Tool                         | Auth        | Task                                       |
| ---------------------------- | ----------- | ------------------------------------------ |
| `events_near_me`             | anonymous   | events near a city                         |
| `events_matching_interests`  | anonymous   | events matching one or more interests      |
| `get_event`                  | anonymous   | look up one event                          |
| `create_event`               | WorkOS user | create an event as the signed-in host      |
| `update_event`               | WorkOS user | edit / manage (e.g. cancel) an event        |

Write tools require the MCP client to present `Authorization: Bearer <WorkOS
access token>`. The worker forwards it to the app (`POST /api/events`, `PATCH
/api/events/:id`), which verifies it and enforces entity-centric host
authorization. No autonomous/agent tools are exposed yet — that is future work.

## Data path

Tools call `${APP_API_URL}/api/...`. `APP_API_URL` defaults to `https://nhimbe.com`
in production and `http://localhost:11825` in dev.

## Develop

```bash
cd worker
npm install
cp .dev.vars.example .dev.vars   # point APP_API_URL at your local app or a preview
npm run dev                      # wrangler dev on :8787
npm run test:run                 # vitest
```

## Deploy

```bash
npm run deploy -- --env production     # or --env staging
```

### DNS / routing (required)

The MCP is served at **`events.mukoko.com/mcp/*`** by a Worker route that sits in front
of Vercel. For that route to fire, the `events.mukoko.com` record must be **proxied
through Cloudflare (orange cloud)** — not DNS-only — with Vercel as the origin:

1. In the Cloudflare dashboard for the `mukoko.com` zone, set the `events`
   record(s) that point at Vercel to **Proxied** (orange cloud). Vercel keeps
   serving the site; Cloudflare now fronts it.
2. Keep Vercel's domain verification satisfied (the `A`/`CNAME` values Vercel
   provides). Proxying does not change the origin — it only lets a Worker route
   intercept a path.
3. `wrangler deploy --env production` registers the route `events.mukoko.com/mcp/*`
   (see `wrangler.toml`). Requests to `/mcp/*` hit this worker; everything else
   passes through to Vercel.
4. Verify: `curl https://events.mukoko.com/mcp -X POST -H 'content-type: application/json'
   -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'` should list the tools.

> The worker calling `https://nhimbe.com/api/...` is not intercepted by the
> `/mcp/*` route, so tool requests reach Vercel normally.
