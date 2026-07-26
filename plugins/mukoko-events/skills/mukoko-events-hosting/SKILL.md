---
name: mukoko-events-hosting
description: Host on Mukoko Events (Nhimbe) — create a new event and update or manage (edit, cancel) an event you host, via the Mukoko Events MCP. Use when a signed-in user wants to publish an event, change its details, or cancel it. These are write actions and REQUIRE a WorkOS bearer token; if the user isn't authenticated, walk them through connecting first.
---

# Hosting events on Mukoko Events

**Mukoko Events** (also branded **Nhimbe**) lets hosts publish and manage events
through its **MCP server** at **`https://events.mukoko.com/mcp`**. This skill
covers the **write** tools. Unlike discovery, these **require authentication**.

## Authentication (required for every tool here)

Writes are gated by a **WorkOS AuthKit bearer token**. The MCP client must send:

```
Authorization: Bearer <WorkOS access token>
```

The worker forwards the token to the Nhimbe app, which verifies it (JWKS) and
enforces host authorization — the MCP itself owns no data and makes no trust
decision. If no token is present the tool returns an error asking the user to
sign in.

**To obtain a token**, follow the standard discovery flow from the Nhimbe
origin:

- Agent auth guide (human-readable): `https://events.mukoko.com/auth.md`
- OAuth authorization server metadata (RFC 8414): `https://events.mukoko.com/.well-known/oauth-authorization-server`
- Protected resource metadata (RFC 9728): `https://events.mukoko.com/.well-known/oauth-protected-resource`
- OpenID configuration: `https://events.mukoko.com/.well-known/openid-configuration`

WorkOS is the real authorization server; complete its OAuth 2.1 + PKCE flow to
get an access token, then present it as the bearer above. **If the user isn't
signed in yet, guide them through this before calling any tool below** — don't
retry a write blindly.

## Tools

| Tool | Use it to… | Auth | Notes |
| --- | --- | --- | --- |
| `create_event` | Publish a new event as the signed-in host | bearer | Not idempotent — one call creates one event |
| `update_event` | Edit details or change status (e.g. **cancel**) of an event you host | bearer | **Destructive**: a status change can cancel an event |

### `create_event`

Required: `name`, `startDate` (ISO-8601, e.g. `2026-08-01T18:00:00Z`).
Common optional fields:

- `description`
- `endDate` (ISO-8601; defaults to start + 1h)
- `isOnline` (boolean) with `meetingUrl` for online events
- `venue`, `streetAddress`, `addressLocality` (city), `addressCountry` for in-person
- `category` (e.g. `"Music"`)
- `isFree` (boolean, default true); `ticketUrl` for paid events
- `maximumAttendeeCapacity` (integer ≥ 1)
- `visibility` (`"public"` | `"private"`, default public)

Before calling, **confirm the essentials with the user** — title, date/time
(and timezone), online-vs-venue, and free-vs-ticketed — since this publishes a
real event. Returns the created event card.

### `update_event`

Required: `eventId`. Pass only the fields you want to change: `name`,
`description`, `startDate`, `endDate`, or `status`
(`"published"` | `"cancelled"` | `"draft"`).

**Cancelling is a status change** (`status: "cancelled"`) and is destructive —
always confirm with the user before cancelling, and echo back which event
(by name) you're about to change.

## Worked examples

**"Create a free online talk on Aug 1 at 6pm UTC called 'Intro to Shona AI'."**
→ ensure the user is authenticated, then `create_event` with
`{ "name": "Intro to Shona AI", "startDate": "2026-08-01T18:00:00Z", "isOnline": true, "isFree": true }`
(ask for a `meetingUrl` and `description` if not given).

**"Cancel my event `evt_123`."**
→ confirm the event name with `get_event` (from the discovery skill), then, on
confirmation, `update_event` with `{ "eventId": "evt_123", "status": "cancelled" }`.

## Good practice

- **Never call a write tool without a bearer token** — resolve sign-in first.
- **Confirm before publishing or cancelling.** These are real, user-visible actions.
- Surface the returned event card/URL so the user can verify the result.
- To find an event id before updating, use the `mukoko-events-discovery` skill's `get_event` / search tools.
