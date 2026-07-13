# superpowers plans

This subtree holds plans written in the
[superpowers](https://github.com/obra/superpowers) agentic-worker format — paired
**spec** and **implementation plan** documents with checkbox (`- [ ]`) task
tracking, meant to be executed task-by-task by an agent.

Like everything under [`../plans/`](../plans/), these are **archived,
point-in-time records** — each file carries an archival banner. See the root
[`CLAUDE.md`](../../CLAUDE.md) for current architecture and the
[docs index](../README.md) for a map of all docs.

## Contents

| Document | Kind | Note |
| --- | --- | --- |
| [`specs/2026-03-20-progressive-onboarding-design.md`](./specs/2026-03-20-progressive-onboarding-design.md) | Spec | Progressive-onboarding design intent (shipped); D1/Supabase data details superseded |
| [`plans/2026-03-20-progressive-onboarding.md`](./plans/2026-03-20-progressive-onboarding.md) | Plan | Implementation plan for the spec; profile writes are now Server Actions on MongoDB |

The nested `plans/` and `specs/` layout is preserved so any external references
to these paths keep resolving.
