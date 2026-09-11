<div align="center">

<img src="./public/app-icon-192.png" alt="Nhimbe" width="96" height="96">

# Nhimbe

**Together we gather, together we grow.**

Discover, host, and grow community events across African cities.

[![CI](https://github.com/nyuchi/nhimbe/actions/workflows/ci.yml/badge.svg)](https://github.com/nyuchi/nhimbe/actions/workflows/ci.yml)
[![Live site](https://img.shields.io/badge/live-events.mukoko.com-1f6feb.svg)](https://events.mukoko.com)
[![Join the community on Discord](https://img.shields.io/badge/Discord-join%20the%20community-5865F2?logo=discord&logoColor=white)](https://discord.gg/CP2P4JpPR)
[![License: MIT](https://img.shields.io/badge/License-MIT-1f6feb.svg)](./LICENSE)

**[events.mukoko.com](https://events.mukoko.com)** &nbsp;·&nbsp; **[nhimbe.com](https://nhimbe.com)**

</div>

---

## About

**Nhimbe** (pronounced /ˈnhimbɛ/) is the community events platform of the [Mukoko](https://mukoko.com) super app. It takes its name from the Shona tradition of _nhimbe_ — the communal work gathering where neighbours come together to get something done and share in the harvest.

That spirit — the Ubuntu idea that _I am because we are_ — runs through the whole product. **Together we gather, together we grow.** Nhimbe exists to help communities across African cities find one another, plan the moment, and turn up.

## Which piece this is

Nhimbe is **the public app** — the thing an attendee or a host actually opens.
Two sibling repos carry the other two surfaces, and the three are easy to
confuse:

| Repo                         | What it is                                                                                                                                                                                | Where it runs                                |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| **`nyuchi/nhimbe`** ← here   | **The public app and the data plane.** The Next.js app, the MongoDB layer, the `/api/events*` REST surface, and the OAuth resource-server metadata everything else authenticates against. | Vercel — `events.mukoko.com` + `nhimbe.com`  |
| `nyuchi/mukoko-events-admin` | **The staff back office.** Moderating events, people, entities and platform settings. `/admin*` here 307s to it.                                                                          | Vercel — `admin.events.mukoko.com`           |
| `nyuchi/mukoko-events-mcp`   | **The agent surface.** A stateless MCP server that owns no data — every tool calls this app's HTTP API.                                                                                   | Cloudflare Workers — `events.mukoko.com/mcp` |

This repo ships no admin routes and no worker: `src/app/admin/` does not exist,
and there is no `wrangler.toml`. What it does ship on their behalf is the host
gate (`src/lib/auth/mcp-host.ts`) and the `.well-known` discovery documents the
MCP's OAuth challenge points clients at.

### Two production domains

Both **`events.mukoko.com`** and **`nhimbe.com`** fully serve the app, and
`www.nhimbe.com` redirects to the latter. `events.mukoko.com` is the **primary**:
every self-referential URL a crawler consumes — canonical tags, OpenGraph and
Twitter images, the sitemap, robots, schema.org JSON-LD — points there, so SEO
signals consolidate on one origin instead of splitting across two. Runtime
behaviour is identical on either host. See `src/lib/site-url.ts`.

## What you can do

- **Discover & browse** — Start on `/discover` and drill into a category, a circle, or a city; search by interest, place, and time.
- **Create & host** — Publish gatherings with rich details, cover art, and recurring schedules, then manage them from one place.
- **RSVP & waitlists** — Reserve a spot with capacity limits that never oversell a room, and let people queue when it's full.
- **Circles** — Community groups that live alongside your events and keep people connected between them, each leading with its own events timeline.
- **Calendars** — Followable event calendars, a branded month view, and one-tap calendar export.
- **Check in with QR** — Fast, on-the-day attendance using QR codes and on-site kiosk mode.
- **Signage** — Turn any screen into a live event display for venues and lobbies.
- **Shamwari, your AI helper** — A friendly assistant that helps you find the right event and write great descriptions.
- **Reviews, ratings & referrals** — Build trust, help the best gatherings rise, and grow reach through the people who show up.
- **Reminders & updates** — Keep attendees in the loop so no one misses the moment.
- **Your language** — Available in English and Shona, with more on the way.
- **Anywhere** — Installable, fast, and accessible (WCAG AAA), in light or dark.

## Stack

- **Next.js 16** (App Router, React 19, TypeScript strict, Tailwind v4) — one full-stack app, no separate backend.
- **MongoDB** (Mukoko v3.1 cluster) — read/written **server-side only** via the `mongodb` driver; SSR-first, writes through Server Actions.
- **WorkOS AuthKit** — hosted sign-in end to end.
- **Cloudflare** — R2 for media, and the AI Gateway fronting Shamwari, with Atlas Vector Search for retrieval. (Model identifiers are deliberately not committed anywhere in this repo — see AGENTS.md.)
- **Vercel** — builds and deploys every push (preview per branch, production on `main`).

Maps (Leaflet + OpenStreetMap), geocoding (OSM Nominatim), and weather (the shared Mukoko embed) need no API keys.

## Quickstart

You'll need a recent **Node.js LTS** and **npm**.

```bash
npm install                  # install dependencies
cp .env.example .env.local   # then fill in your values

npm run dev          # dev server at http://localhost:11825
npm run build        # production build
npm run lint         # ESLint
npm run test:run     # the Vitest suite, once
npm run test:integration  # the suite that needs a real MongoDB
```

Every environment variable is listed, with notes, in **[.env.example](./.env.example)**. The architecture reference is **[AGENTS.md](./AGENTS.md)**, with longer-form notes under **[docs/](./docs)**.

## Surface map

| Surface         | Route                            | What it is                                                                                        |
| --------------- | -------------------------------- | ------------------------------------------------------------------------------------------------- |
| Home            | `/`                              | Auth-split — a lean landing when logged out, "Your events" when signed in                         |
| Discover        | `/discover`                      | The browse surface: category tiles → featured circles → city cards                                |
| Events          | `/events`                        | The all-events timeline, scopeable by `?category=` / `?city=`; plus create, detail, and manage    |
| Circles         | `/circles`                       | Community groups (formerly "Kraal"), each leading with an events tab                              |
| Calendar        | `/calendar`                      | Branded month view + agenda; followable calendars and ICS export                                  |
| Search          | `/search`                        | Interest, place, and time search                                                                  |
| Signage / kiosk | `/signage`, `/events/[id]/kiosk` | Live event displays and on-site check-in                                                          |
| Admin           | `/admin`                         | Operator dashboard — a **separate app** (`nyuchi/mukoko-events-admin`); `/admin*` redirects there |

## Working with agents

Nhimbe is built to be worked on by coding agents as well as people.

- **[AGENTS.md](./AGENTS.md)** — the tool-agnostic standing rules (checks, boundaries, workflow) any runner should follow. This is the authoritative reference.
- **[docs/](./docs)** — longer-form design notes and archived plans.

`CLAUDE.md` and `.claude/` are deliberately **untracked** — they are local
developer conveniences, not part of the repo. Do not expect them in a fresh
clone.

## Community

Have a question, an idea, or want to help shape Nhimbe? Join the people building it:

**→ [discord.gg/CP2P4JpPR](https://discord.gg/CP2P4JpPR)**

## Documentation

| Document                             | Purpose                                           |
| ------------------------------------ | ------------------------------------------------- |
| [CONTRIBUTING.md](./CONTRIBUTING.md) | Set up a local environment and contribute         |
| [AGENTS.md](./AGENTS.md)             | Standing rules for coding agents                  |
| [.env.example](./.env.example)       | Every environment variable, annotated             |
| [SECURITY.md](./SECURITY.md)         | Security policy and how to report a vulnerability |
| [RELEASES.md](./RELEASES.md)         | Changelog and release process                     |

## Security

We take the safety of the community seriously. If you discover a vulnerability, please report it responsibly — see **[SECURITY.md](./SECURITY.md)**. Please don't open a public issue for security reports.

## Contributing

Pull requests are welcome. Read **[CONTRIBUTING.md](./CONTRIBUTING.md)** for setup, conventions, and the PR process before you start.

## License

Released under the MIT License — see **[LICENSE](./LICENSE)**.

---

<div align="center">

**Nhimbe** is a [Mukoko](https://mukoko.com) product by [Nyuchi Web Services](https://nyuchi.com).

</div>
