---
name: deploy
description: Ship nhimbe — Vercel deploys automatically on push; run the pre-flight checks before merging
disable-model-invocation: true
allowed-tools: Read, Bash, Grep, Glob
---

Ship nhimbe: $ARGUMENTS

## How deploys work

nhimbe is a single full-stack Next.js app on **Vercel**. There is **no manual
deploy step** — Vercel builds and deploys **every push**:

- **Preview** deployment per branch/PR
- **Production** on merge to `main`

So "deploying" is really: get the branch green, open/merge the PR, and let
Vercel ship it. The `worker/` directory is the separate **`nhimbe-mcp`** server
(the MCP at `nhimbe.com/mcp`) — it is not part of an app deploy and ships on its
own via `wrangler deploy --env production` from `worker/`.

## Current state

- Branch: !`git branch --show-current`
- Uncommitted changes: !`git status --short`
- Last commit: !`git log --oneline -1`

## Pre-flight checks (run before merging)

Run ALL of these. If any fail, stop and fix before merging.

1. **Lint**: `npm run lint`
2. **Tests**: `npm run test:run` (or `npx vitest run`)
3. **Build**: `npm run build`
4. **Clean git state**: no uncommitted changes (warn if there are)

## Ship

1. Push the branch and open a PR (draft until ready).
2. Confirm CI is green (lint + CI + CodeQL) and the Vercel preview is Ready.
3. Merge to `main` → Vercel deploys production automatically.
4. Verify production at https://nhimbe.com.

## Environment

App config lives in Vercel env vars (prod + preview): `MONGODB_URI`,
`WORKOS_*`, `SHAMWARI_AI_GATEWAY_*`, `NEXT_PUBLIC_*`. `NEXT_PUBLIC_API_URL` is
intentionally unset — the internal API is same-origin. There are no
Supabase/Postgres vars.
