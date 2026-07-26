---
name: mukoko-events-discovery
description: Discover community events across Africa on Mukoko Events (Nhimbe) — find events near a city, match events to someone's interests, and look up a specific event's details. Use when a user wants to find, browse, or get details about real-world or online events (music, tech, community gatherings, etc.) on Mukoko Events / Nhimbe, or asks "what's on near me". Read-only; needs no sign-in.
---

# Discovering events on Mukoko Events

**Mukoko Events** (the product also branded **Nhimbe** — same thing) is a
community-events platform for Africa. It exposes a task-based **MCP server** at
**`https://events.mukoko.com/mcp`** (Streamable HTTP, JSON-RPC 2.0). This skill
covers the **read-only discovery** tools — they need **no authentication**.

## Connect

Point your MCP client at the Streamable-HTTP endpoint:

```
https://events.mukoko.com/mcp
```

No token is required for the discovery tools below. (Only event *creation* and
*management* need a WorkOS bearer token — see the `mukoko-events-hosting` skill.)

## Tools

| Tool | Use it to… | Key inputs |
| --- | --- | --- |
| `events_near_me` | Find upcoming events near a place | `city` (recommended), `limit` (1–40, default 12) |
| `events_matching_interests` | Find events matching one or more interests/categories | `interests` (string array, **required**), optional `city`, `limit` |
| `get_event` | Look up one event's full details | `eventId` — an id, slug, **or** short code |

All three are read-only, idempotent, and return **inline HTML** (a carousel for
many events, a card for one) plus a **plain-text fallback** — render the HTML
when your client supports it, otherwise show the text.

## How to choose the right tool

- The user names a place ("events in Harare", "what's on near me") → **`events_near_me`** with `city`. If they didn't give a city, ask for one (it's optional but the results are far better with it).
- The user names topics/interests ("music and tech events", "afrobeats") → **`events_matching_interests`** with `interests: ["Music", "Tech"]`. Add `city` if they also gave a location.
- The user references a specific event (a link like `events.mukoko.com/e/<code>`, a slug, or "that jazz night") → **`get_event`** with the id/slug/short code.

## Worked examples

**"What's happening in Harare this weekend?"**
→ `events_near_me` with `{ "city": "Harare" }`. Summarize the returned events (name · date · venue) and offer to open any one with `get_event`.

**"Find me music or art events in Bulawayo."**
→ `events_matching_interests` with `{ "interests": ["Music", "Art"], "city": "Bulawayo" }`.

**"Tell me more about `sunset-sessions-6f6c6b`."**
→ `get_event` with `{ "eventId": "sunset-sessions-6f6c6b" }`.

## Good practice

- **Keep `limit` modest** (the default 12 is usually right) and paginate by asking a follow-up rather than requesting 40 at once.
- **Surface the essentials** from each result — event name, date/time, venue or "online", and host — then let the user drill in with `get_event`.
- If a search returns nothing, suggest widening: drop the city, broaden the interests, or try a nearby city.
- These tools read the **live** catalogue, so results change over time — don't cache answers across sessions.
- To let the user **RSVP, create, or manage** an event, hand off to the `mukoko-events-hosting` skill (those actions require sign-in).
