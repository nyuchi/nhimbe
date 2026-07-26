# Mukoko Events — ChatGPT connector

Add **Mukoko Events** (Nhimbe) to ChatGPT as a **custom connector**. ChatGPT
talks to the same remote MCP server the Claude plugin uses —
**`https://events.mukoko.com/mcp`** — so discovery and hosting work the same way.

> Custom MCP connectors require a plan that supports them (ChatGPT
> Plus/Pro/Business/Enterprise/Edu) and, for some workspaces, enabling
> **Developer mode** / **custom connectors** in settings. Availability is set by
> OpenAI, not by us.

## Add the connector

1. In ChatGPT, open **Settings → Connectors** (Business/Enterprise admins:
   **Settings → Connectors**, then allow the workspace to use it).
2. Choose **Create** / **Add custom connector** (enable **Developer mode** first
   if your workspace requires it for custom MCP servers).
3. Fill in:
   - **Name**: `Mukoko Events`
   - **MCP server URL**: `https://events.mukoko.com/mcp`
   - **Authentication**:
     - **No authentication** — enough for the read tools (`events_near_me`,
       `events_matching_interests`, `get_event`).
     - **OAuth** — required for the write tools (`create_event`,
       `update_event`). Point OAuth discovery at the Nhimbe origin, which
       advertises the standard metadata:
       `https://events.mukoko.com/.well-known/oauth-protected-resource` and
       `.../oauth-authorization-server` (WorkOS is the authorization server).
       See `https://events.mukoko.com/auth.md`.
4. Save. The five Mukoko Events tools now appear in the composer's tool /
   connector picker (and, in Deep Research, as a searchable source).

## Try it

> "Use Mukoko Events to find music events in Harare this month."

ChatGPT calls `events_near_me` / `events_matching_interests` and shows the
results. Each tool also returns machine-readable event fields, so ChatGPT can
reason over dates, locations, and links directly.

## Notes

- **Single endpoint.** The MCP is served **only** at `events.mukoko.com/mcp`
  (never `nhimbe.com/mcp`) — use exactly that URL.
- **Transport.** Streamable HTTP, stateless — no SSE stream and no session
  handshake required.
- **Read vs write.** Reads are anonymous. Writes are gated on a WorkOS bearer
  token; without OAuth configured, the write tools return a clear "sign in"
  error rather than failing silently.

`mukoko-events.connector.json` in this folder is a machine-readable summary of
the connector (URL, transport, tools, auth) for tooling and documentation — the
actual setup is the UI flow above.
