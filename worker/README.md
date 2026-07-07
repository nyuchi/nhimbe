# nhimbe-mcp

The **nhimbe MCP server** — a task-based [Model Context Protocol](https://modelcontextprotocol.io)
server, and the only thing that runs on Cloudflare Workers. It owns no data:
every tool reads and writes through the nhimbe app API. Everything else
(events, auth, email, AI) lives on the Vercel app.

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

The MCP is served at **`nhimbe.com/mcp/*`** by a Worker route that sits in front
of Vercel. For that route to fire, the `nhimbe.com` record must be **proxied
through Cloudflare (orange cloud)** — not DNS-only — with Vercel as the origin:

1. In the Cloudflare dashboard for the `nhimbe.com` zone, set the apex/`www`
   record(s) that point at Vercel to **Proxied** (orange cloud). Vercel keeps
   serving the site; Cloudflare now fronts it.
2. Keep Vercel's domain verification satisfied (the `A`/`CNAME` values Vercel
   provides). Proxying does not change the origin — it only lets a Worker route
   intercept a path.
3. `wrangler deploy --env production` registers the route `nhimbe.com/mcp/*`
   (see `wrangler.toml`). Requests to `/mcp/*` hit this worker; everything else
   passes through to Vercel.
4. Verify: `curl https://nhimbe.com/mcp -X POST -H 'content-type: application/json'
   -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'` should list the tools.

> The worker calling `https://nhimbe.com/api/...` is not intercepted by the
> `/mcp/*` route, so tool requests reach Vercel normally.
