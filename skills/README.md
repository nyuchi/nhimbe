# Mukoko Events — Agent Skills

Portable [Agent Skills](https://docs.claude.com/en/docs/agents-and-tools/agent-skills)
that teach any MCP-capable agent to work with **Mukoko Events** (the product
also branded **Nhimbe** — same platform) through its task-based MCP server at
**`https://events.mukoko.com/mcp`**.

Each skill is a folder with a `SKILL.md` whose frontmatter (`name` +
`description`) drives discovery; the body is the instructions the agent loads
when the skill triggers. They are grounded in the live MCP tool surface
(`worker/src/mcp/`) and the agent-auth discovery surface (`/auth.md`,
`/.well-known/*`).

| Skill | What it covers | Auth |
| --- | --- | --- |
| [`mukoko-events-discovery`](./mukoko-events-discovery/SKILL.md) | Find events near a city, match events to interests, look up one event | None (read-only) |
| [`mukoko-events-hosting`](./mukoko-events-hosting/SKILL.md) | Create an event; update or cancel an event you host | WorkOS bearer token |

## Using them

- **In a client that supports Agent Skills**, install/point it at these folders; the client loads a skill when its `description` matches the task.
- **As plain guidance**, the `SKILL.md` bodies double as human-readable playbooks for the Mukoko Events MCP.

## Keeping them accurate

If the MCP tool surface changes (`worker/src/mcp/tools.ts`) — tools added,
renamed, or their inputs changed — update the affected `SKILL.md` so the
instructions stay in step with the server. The single MCP endpoint is
`events.mukoko.com/mcp` (the app is dual-domain, but the MCP is not served on
`nhimbe.com`).
