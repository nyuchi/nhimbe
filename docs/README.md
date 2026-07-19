# nhimbe docs

This directory holds supplementary documentation: a design-system reference and
a set of **archived, point-in-time plans**. It is not the primary source of
truth — the canonical, always-current docs live at the repository root.

## Where the canonical docs live

| Document | Purpose |
| --- | --- |
| [`../CLAUDE.md`](../CLAUDE.md) | Architecture and conventions — the source of truth, kept current |
| [`../README.md`](../README.md) | Project overview and what nhimbe does |
| [`../CONTRIBUTING.md`](../CONTRIBUTING.md) | Local setup, conventions, and the PR process |
| [`../SECURITY.md`](../SECURITY.md) | Security policy and vulnerability reporting |
| [`../RELEASES.md`](../RELEASES.md) | Changelog and release process |
| [`../worker/README.md`](../worker/README.md) | The `nhimbe-mcp` server (task-based MCP at `events.mukoko.com/mcp`) |

**Architecture in one line:** nhimbe is a single **Next.js 16** app on **Vercel**
that reads and writes **MongoDB server-side** (SSR-first, Server Actions), with
**WorkOS AuthKit** for auth, a same-origin `/api` fallback, **Cloudflare R2** for
media, and the **Shamwari** Cloudflare AI Gateway. The `worker/` directory is the
stateless `nhimbe-mcp` server and owns no data.

## Active references

| Document | What it is |
| --- | --- |
| [`mukoko-navigation-system.md`](./mukoko-navigation-system.md) | Reusable header / footer / theme components for Mukoko apps — a design-system reference, not runtime architecture |

## Archived plans (historical records)

These are **dated, point-in-time plans**. They are kept for historical context
and are **not** current architecture — each carries an archival banner at the
top. Several describe a since-retired backend (a standalone Cloudflare Workers
REST service on D1/Supabase, a Hono migration, Paynow payments); nhimbe has since
consolidated onto Vercel + MongoDB, and the worker is now `nhimbe-mcp`. Do not
use these as a guide to how the app works today.

| Plan | Date | Status |
| --- | --- | --- |
| [`plans/2026-02-17-next-phase-design.md`](./plans/2026-02-17-next-phase-design.md) | 2026-02-17 | Archived — roadmap; Hono phase superseded, Paynow not adopted, email later shipped via Resend on the app |
| [`plans/2026-02-17-hono-migration.md`](./plans/2026-02-17-hono-migration.md) | 2026-02-17 | Archived — targeted the retired REST worker; never adopted |
| [`plans/2026-02-18-resilience-observability-a11y-design.md`](./plans/2026-02-18-resilience-observability-a11y-design.md) | 2026-02-18 | Archived — error-boundary/a11y parts shipped; worker observability superseded |
| [`plans/2026-02-18-resilience-observability-a11y.md`](./plans/2026-02-18-resilience-observability-a11y.md) | 2026-02-18 | Archived — implementation plan for the above |
| [`superpowers/plans/2026-03-20-progressive-onboarding.md`](./superpowers/plans/2026-03-20-progressive-onboarding.md) | 2026-03-20 | Archived — onboarding UX shipped; backend mechanics now Server Actions + MongoDB |
| [`superpowers/specs/2026-03-20-progressive-onboarding-design.md`](./superpowers/specs/2026-03-20-progressive-onboarding-design.md) | 2026-03-20 | Archived — design spec for the above |

### The `superpowers/` subtree

`superpowers/plans/` and `superpowers/specs/` hold plans written in the
[superpowers](https://github.com/obra/superpowers) agentic-worker format (checkbox
task tracking, paired spec + implementation plan). They are archival like the
plans above. The nested layout is kept as-is so any external references to those
paths remain valid.
