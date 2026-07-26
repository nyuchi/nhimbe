# Mukoko Events plugin

A [Claude Code plugin](https://code.claude.com/docs/en/plugins) that connects
Claude to **Mukoko Events** (the platform also branded **Nhimbe** — same thing)
so you can discover and manage community events across Africa without leaving
your session.

It bundles two things:

- **The Mukoko Events MCP server** (`.mcp.json`) — the remote task-based server
  at **`https://events.mukoko.com/mcp`**. Its tools (`events_near_me`,
  `events_matching_interests`, `get_event`, `create_event`, `update_event`)
  become available as soon as the plugin is enabled.
- **Two skills** (`skills/`) that teach Claude _when_ and _how_ to use those
  tools:
  - [`mukoko-events-discovery`](./skills/mukoko-events-discovery/SKILL.md) —
    read-only, no sign-in: find events near a city, match events to interests,
    look one up.
  - [`mukoko-events-hosting`](./skills/mukoko-events-hosting/SKILL.md) — write,
    WorkOS-authenticated: create an event, update or cancel one you host.

## Install

From a marketplace that lists this plugin (the `nyuchi/nhimbe` repo is one):

```shell
/plugin marketplace add nyuchi/nhimbe
/plugin install mukoko-events@mukoko
/reload-plugins
```

Or from a local checkout of this repo:

```shell
/plugin marketplace add ./            # run from the repo root
/plugin install mukoko-events@mukoko
/reload-plugins
```

Then just ask, e.g. _"what events are on in Harare this weekend?"_ — the
`mukoko-events-discovery` skill triggers and calls the MCP.

## Auth

- **Discovery is anonymous** — the read tools need no sign-in.
- **Hosting is authenticated** — `create_event` / `update_event` require a
  WorkOS bearer token presented as `Authorization: Bearer <token>`. The
  hosting skill walks the user through connecting; the auth/discovery surface
  is documented at `https://events.mukoko.com/auth.md` and the standard
  `/.well-known/*` OAuth metadata.

## Layout

```text
plugins/mukoko-events/
├── .claude-plugin/
│   └── plugin.json     ← manifest (metadata only)
├── .mcp.json           ← the remote MCP server (events.mukoko.com/mcp)
├── skills/             ← bundled skills (auto-discovered)
│   ├── mukoko-events-discovery/SKILL.md
│   └── mukoko-events-hosting/SKILL.md
└── README.md
```

The bundled skills are copies of the canonical authoring source in the repo's
top-level [`skills/`](../../skills/) directory — a plugin has to contain its own
skills (they are copied to a cache on install and can't reference files outside
the plugin dir). Keep the two in step, and both in step with the live tool
surface in [`worker/src/mcp/tools.ts`](../../worker/src/mcp/tools.ts).

## Not just Claude

The same MCP server backs other clients too — see
[`connectors/chatgpt/`](../../connectors/chatgpt/) for adding Mukoko Events to
ChatGPT as a custom connector.
