---
name: release-check
description: The nhimbe pre-merge gate — lint + build + test:run + the design-token guard, plus how to run a DB-seeded build. Run before opening a PR for review or merging.
---

# release-check — nhimbe pre-merge gate

Run this before you mark a PR ready for review or merge. Every step must pass;
if one fails, stop and fix it rather than merging around it.

## The gate

Run all four from the repo root:

```bash
npm run lint       # ESLint (+ markdownlint/prettier/etc. in CI's lint.yml)
npm run build      # Next.js production build (see the DB note below)
npm run test:run   # Vitest, run once (~682 tests)
```

- **Design-token guard.** `src/__tests__/design-tokens.test.ts` runs as part of
  `test:run` — it enforces the mzizi doctrine tokens (pill radii, tanzanite
  `--primary`, the wash computation). If you touched `src/app/globals.css` or
  theme tokens and want to check it alone:

  ```bash
  npx vitest run src/__tests__/design-tokens.test.ts
  ```

## Build: no Mongo, or a seeded one

`npm run build` normally runs **without** `MONGODB_URI` — that is the default,
and it is intentional. A reachable Mongo that holds a **published upcoming
event** breaks prerendering `/` ("Functions cannot be passed to Client
Components"), a known issue on `main`.

When you need to prove a change builds against real data (per NYU-27 / #71),
seed an in-memory Mongo first and point the build at it — but seed data that
avoids the `/` prerender trap (no published upcoming event, or expect `/` to be
built dynamically). The seed-and-drive mechanics live in the **`db-seed-verify`**
skill; the short version:

```bash
# 1. start mongodb-memory-server-core on a fixed port and seed v3.1 docs
# 2. build against it
MONGODB_URI="mongodb://127.0.0.1:<port>/" npm run build
```

## What CI mirrors

GitHub Actions runs the same shape: `lint.yml` (actionlint, JSON validity,
prettier, markdownlint, yamllint), `ci.yml` (Lint & Build + Frontend Tests),
and CodeQL. Getting this gate green locally means CI should be green too.
Vercel builds the preview on push; confirm it is Ready before review.

## After the gate

- Commit in focused steps; keep the PR draft until this gate is green.
- Open the PR against `main`, mirror `.github/pull_request_template.md`, and
  assign `bryanfawcett`.
