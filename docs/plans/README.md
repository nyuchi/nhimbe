# Archived plans

Everything in this folder is a **dated, point-in-time plan** — a historical
record of what was proposed at the time, not a description of how nhimbe works
today. Each file carries an archival banner at the top. For current architecture
see the root [`CLAUDE.md`](../../CLAUDE.md); for a map of all docs see the
[docs index](../README.md).

## Why these are archived

These plans were written around a **standalone backend** design: a Cloudflare
Workers REST service (later a Hono refactor) on **D1/Supabase**, with **Paynow**
payments. nhimbe has since consolidated into a **single Next.js 16 app on Vercel**
that reads and writes **MongoDB server-side**, with **WorkOS AuthKit** for auth
and the `worker/` directory repurposed as the stateless `nhimbe-mcp` server. As a
result, the backend mechanics in these plans are superseded, even where the
user-facing outcome (error boundaries, accessibility, onboarding UX) shipped.

## How they relate

| Order | Plan | Note |
| --- | --- | --- |
| 1 | [`2026-02-17-next-phase-design.md`](./2026-02-17-next-phase-design.md) | Roadmap that framed the phases below |
| 2 | [`2026-02-17-hono-migration.md`](./2026-02-17-hono-migration.md) | Phase 1 of the roadmap — the backend refactor (never adopted) |
| 3 | [`2026-02-18-resilience-observability-a11y-design.md`](./2026-02-18-resilience-observability-a11y-design.md) | Design that built on the Hono branch |
| 4 | [`2026-02-18-resilience-observability-a11y.md`](./2026-02-18-resilience-observability-a11y.md) | Implementation plan for design (3) |

The progressive-onboarding plan and spec (2026-03-20) live under
[`../superpowers/`](../superpowers/) because they use the superpowers
agentic-worker plan format.
