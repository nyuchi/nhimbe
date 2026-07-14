<div align="center">

<img src="./public/app-icon-192.png" alt="nhimbe" width="96" height="96">

# nhimbe

**Together we gather, together we grow.**

Discover, host, and grow community events across African cities.

[![Live site](https://img.shields.io/badge/live-nhimbe.com-1f6feb.svg)](https://nhimbe.com)
[![Join the community on Discord](https://img.shields.io/badge/Discord-join%20the%20community-5865F2?logo=discord&logoColor=white)](https://discord.gg/CP2P4JpPR)
[![License: MIT](https://img.shields.io/badge/License-MIT-1f6feb.svg)](./LICENSE)

**[nhimbe.com](https://nhimbe.com)**

</div>

---

## About

**nhimbe** (pronounced /ˈnhimbɛ/) is the community events platform of the [Mukoko](https://mukoko.com) super app. It takes its name from the Shona tradition of *nhimbe* — the communal work gathering where neighbours come together to get something done and share in the harvest.

That spirit — the Ubuntu idea that *I am because we are* — runs through the whole product. **Together we gather, together we grow.** nhimbe exists to help communities across African cities find one another, plan the moment, and turn up.

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
- **Cloudflare** — R2 for media, the AI Gateway for Shamwari (Qwen + BGE, with Atlas Vector Search retrieval).
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
npm run test:run     # run the Vitest suite once (~682 tests)
```

The full environment-variable list and architecture reference live in **[CLAUDE.md](./CLAUDE.md)**.

## Surface map

| Surface | Route | What it is |
| --- | --- | --- |
| Home | `/` | Auth-split — a lean landing when logged out, "Your events" when signed in |
| Discover | `/discover` | The browse surface: category tiles → featured circles → city cards |
| Events | `/events` | The all-events timeline, scopeable by `?category=` / `?city=`; plus create, detail, and manage |
| Circles | `/circles` | Community groups (formerly "Kraal"), each leading with an events tab |
| Calendar | `/calendar` | Branded month view + agenda; followable calendars and ICS export |
| Search | `/search` | Interest, place, and time search |
| Signage / kiosk | `/signage`, `/events/[id]/kiosk` | Live event displays and on-site check-in |
| Admin | `/admin` | Operator dashboard — a **separate app** (`admin/`); `/admin*` redirects there |

## Working with agents

nhimbe is built to be worked on by coding agents as well as people.

- **[AGENTS.md](./AGENTS.md)** — the tool-agnostic standing rules (checks, boundaries, workflow) any runner should follow.
- **[.claude/skills/](./.claude/skills/)** — task routines (e.g. `release-check`, `db-seed-verify`, `verify`).
- **[CLAUDE.md](./CLAUDE.md)** — the fuller architecture and contributor reference for Claude Code.

## Community

Have a question, an idea, or want to help shape nhimbe? Join the people building it:

**→ [discord.gg/CP2P4JpPR](https://discord.gg/CP2P4JpPR)**

## Documentation

| Document | Purpose |
| --- | --- |
| [CONTRIBUTING.md](./CONTRIBUTING.md) | Set up a local environment and contribute |
| [AGENTS.md](./AGENTS.md) | Standing rules for coding agents |
| [CLAUDE.md](./CLAUDE.md) | Architecture and contributor reference |
| [SECURITY.md](./SECURITY.md) | Security policy and how to report a vulnerability |
| [RELEASES.md](./RELEASES.md) | Changelog and release process |

## Security

We take the safety of the community seriously. If you discover a vulnerability, please report it responsibly — see **[SECURITY.md](./SECURITY.md)**. Please don't open a public issue for security reports.

## Contributing

Pull requests are welcome. Read **[CONTRIBUTING.md](./CONTRIBUTING.md)** for setup, conventions, and the PR process before you start.

## License

Released under the MIT License — see **[LICENSE](./LICENSE)**.

---

<div align="center">

**nhimbe** is a [Mukoko](https://mukoko.com) product by [Nyuchi Web Services](https://nyuchi.com).

</div>
