# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**nhimbe** (pronounced /ˈnhimbɛ/) — community events discovery and management platform, part of the Mukoko ecosystem. It is a single full-stack **Next.js 16** app (App Router, React 19, TypeScript strict, Tailwind v4) deployed on **Vercel** — there is no separate application backend. Data lives in **MongoDB** (the Mukoko v3.1 cluster) and is read/written **server-side only** via the official `mongodb` driver. Auth is **WorkOS AuthKit** end-to-end. AI ("Shamwari") runs through the **Cloudflare AI Gateway**; media is stored in **Cloudflare R2**.

Worker note: the `worker/` directory is now the **`nhimbe-mcp`** server — a task-based MCP at `nhimbe.com/mcp` and the only thing that runs on Cloudflare Workers. It is **not** part of the app request path (feature work lives in `src/`); see "nhimbe MCP" below.

## Build & Dev Commands

```bash
# From the repo root
npm install
npm run dev          # Dev server at http://localhost:11825
npm run build        # Production build (Next.js)
npm run lint         # ESLint

# Tests (Vitest)
npm run test         # Watch mode
npm run test:run     # Run once (~212 tests)
npm run test:coverage
npx vitest run src/lib/api.test.ts   # Single test file
```

Database: MongoDB collections/validators are owned by the Mukoko platform, not this repo. nhimbe only reads/writes documents via the `mongodb` driver (`src/lib/mongo/`). There are no migrations in this repo.

## CI Pipeline

GitHub Actions:

- **`lint.yml`** — org reusable lint workflow (actionlint, JSON validity, prettier, markdownlint, yamllint).
- **`ci.yml`** — Lint & Build (`npm run lint` + `npm run build` with placeholder env vars) and Frontend Tests (`npm run test:run`). Worker jobs cover the `nhimbe-mcp` server in `worker/` (its own vitest suite).
- **CodeQL** — security scanning.

Vercel builds and deploys every commit (preview per branch, production on `main`).

## Architecture

### SSR-first, MongoDB server-side

The default data path is **server-side rendering**: React Server Components read MongoDB directly through the driver. Examples: `src/app/page.tsx` (home), `src/app/events/page.tsx` (listing), `src/app/events/[id]/page.tsx` (detail). Writes go through **Server Actions** (`src/app/actions/`). The browser **never** connects to MongoDB — `import "server-only"` guards the Mongo layer.

The internal API at **`nhimbe.com/api`** (route handlers in `src/app/api/`) is a same-origin **fallback** for client-triggered needs, not the primary path. `NEXT_PUBLIC_API_URL` is intentionally **unset** so `src/lib/api.ts` calls the same origin.

**Realtime** read/sync (live engagement, kiosk pairing, QR check-in, live online-event counts) is a **future** addition — it is not viable on Vercel serverless yet, so those surfaces currently use SSR plus polling.

### MongoDB layer (`src/lib/mongo/`)

Connection lives in `client.ts` — a cached `MongoClient` (no caching of rejected connection promises). Documents follow the Mukoko v3.1 conventions: string-UUID `_id`, `_schemaVersion`, camelCase fields, BSON dates, and JSON-Schema validators enforced by the cluster.

| File                    | Purpose                                                                 |
| ----------------------- | ----------------------------------------------------------------------- |
| `client.ts`             | Cached `MongoClient` connection (`server-only`)                         |
| `databases.ts`          | `DB` database-name map + typed collection accessors                     |
| `events.ts`             | Event reads/writes                                                      |
| `lookups.ts`            | Categories, cities, community stats                                     |
| `engagement.ts`         | Reviews, ratings, referrals, tracked links (global engagement)          |
| `stats.ts`              | Aggregated analytics                                                    |
| `kiosk.ts`              | Kiosk/device pairing                                                    |
| `host-registrations.ts` | Host-side registration reads                                            |
| `admin.ts`              | Admin dashboard queries                                                 |
| `entities.ts`           | Host entities and memberships                                           |
| `users.ts`              | `identity.persons` (WorkOS user mirror)                                 |
| `mappers.ts`            | Mongo doc → schema.org-aligned API shape (with `mappers.test.ts`)       |
| `search.ts`             | Atlas `$vectorSearch` retrieval over `events.eventEmbeddings`           |
| `types.ts`, `ids.ts`    | Doc types; ID/short-code/slug generation                               |

Databases (`DB` map): `events`, `identity`, `entity`, `engagement`, `places`, `circles`, `device`, `wallet`, `system`.

### Data model (entity-centric hosting)

Hosting is **entity-centric**: `events.events.primaryHostEntityId` → `entity.entities` → `identity.persons` (via memberships / `founderPersonId`). Places live in `places.places`; Kraal community circles in `circles.*`.

### Engagement (global cross-platform substrate)

`engagement.*` collections (reviews, ratings, referrals, comments, reactions, trackedLinks, …) are **shared across all Mukoko products**, not owned by nhimbe. Event-scoped queries filter by `targetReferenceType: "event"` and `targetProductId: <eventId>`. Engagement primitives (reviews, likes/reactions, saves, comments) are universal across content types; **events additionally add RSVPs and check-ins**. **End-to-end encryption is disabled** — reviews/ratings carry plaintext bodies.

### Server Actions (`src/app/actions/`)

Mutations and client-invoked reads: `auth`, `events`, `discovery`, `my-events`, `registrations`, `host-registrations`, `host-entities`, `host-card`, `kiosk`, `admin`, `engagement`, `saves`, `waitlist`, `search`, `profile`, `circles`, `circle-detail`, `campfire`, `places`, `map-places`, `geocode`, `polls`, `programme`, `badges`, `ai`.

### Route Handlers (`src/app/api/`)

Same-origin fallback endpoints: `events`, `events/[id]` (both also take bearer-authed `POST`/`PATCH` for the MCP), `categories`, `cities`, `community/stats`, `og` (OG image), `media/upload` (WorkOS-gated cover-image upload to R2), and `auth/dev-login` (local dev bypass only). Auth itself is handled by the hosted-AuthKit entry route `/auth/hosted` (redirects to WorkOS) and `/callback` — see the Authentication Flow section.

### Authentication Flow (WorkOS AuthKit — hosted UI)

Auth uses **WorkOS's hosted AuthKit UI**. nhimbe no longer ships a self-hosted sign-in page or headless User Management routes — every "Sign in" / "Sign up" affordance links to the entry route **`/auth/hosted`** (`src/app/auth/hosted/route.ts`), which builds the hosted URL and redirects to WorkOS:

- **Sign in** — `getSignInUrl({ returnTo })`; **Sign up** — `getSignUpUrl({ returnTo })` via `?screen=sign-up`. The route is a Route Handler (not an RSC) because these writers set PKCE/state cookies. `return_to` is a deep-link back into the app after login, clamped to a same-origin absolute path by `safeReturnTo` (`src/lib/auth/return-to.ts`) so it can never be an open redirect (rejects `//host`, `/\`, external URLs). A missing/misconfigured WorkOS env yields a clear **503**.
- The **hosted UI owns all methods** — email code, password, **MFA (TOTP)**, **passkeys** and **social login** are configured in the WorkOS dashboard, not in our code. (This replaces the former self-hosted magic/password/MFA-OTP/SSO surface, which is gone.)
- After the user authenticates, WorkOS redirects to **`/callback`** (`handleAuth`) which exchanges the code for a session and sets the encrypted session cookie.

`src/lib/auth/workos-token.ts` verifies bearer access tokens (for the MCP write endpoints) — a separate trust boundary, untouched by the hosted migration.

- `src/proxy.ts` — Next.js 16 proxy (was middleware in <=15); manages AuthKit session cookies. Guards a missing-env misconfig with a 503 on `/auth/*` and `/callback`.
- `withAuth()` from `@workos-inc/authkit-nextjs` gives server components/actions the current user.
- **First-login person sync** — the `AuthProvider` (`syncCurrentUser` server action) and `resolveActingPerson` (`src/lib/auth/current-person.ts`) both resolve the session via `withAuth()` and lazily upsert the WorkOS user into `identity.persons`. This fires on the first render after the hosted `/callback` establishes the session — it never depended on the removed routes.
- `src/lib/auth/dev.ts` + `/api/auth/dev-login` — local dev auth bypass (kept).
- `/callback` is the canonical post-auth landing; `/authenticate` is a legacy redirect → `/`.

> **WorkOS environment alignment (critical):** `WORKOS_API_KEY`, `WORKOS_CLIENT_ID`, the `identity.nyuchi.com` custom domain (where the hosted AuthKit UI is served), and the hosted AuthKit configuration **must all belong to the same WorkOS environment**. A key/client-id/domain split across environments makes the hosted redirect succeed but the callback code exchange fail.

### AI — Shamwari (`src/lib/ai/`)

AI runs through the **Cloudflare AI Gateway** (server-side only, `src/lib/ai/gateway.ts`):

- **Generation**: Qwen (`@cf/qwen/qwen3-30b-a3b-fp8`) — powers the description wizard (`src/app/actions/ai.ts`) and the Shamwari assistant.
- **Embeddings**: BGE (`@cf/baai/bge-base-en-v1.5`, 768-dim).
- **Retrieval**: MongoDB **Atlas Vector Search** — `$vectorSearch` over `events.eventEmbeddings` (`src/lib/mongo/search.ts`, index `event_vector_index`). Event embedding maintenance in `src/lib/ai/event-index.ts`.

Env: `SHAMWARI_AI_GATEWAY_URL`, `SHAMWARI_AI_GATEWAY_TOKEN`, and optional `SHAMWARI_AI_GATEWAY_AUTH_TOKEN` (only for the authenticated gateway).

### Storage — Cloudflare R2

Media lives in the **shared** Mukoko bucket `mukoko-storage`, served at `assets-s001.mukoko.com` (`getMediaUrl` in `src/lib/api.ts`, overridable via `NEXT_PUBLIC_ASSETS_URL`) — **not** a per-app silo. Reads need no credentials. **Uploads** (event cover images) go through `POST /api/media/upload` (WorkOS session-gated; validates image type + 4 MB) which writes to `mukoko-storage` via `src/lib/r2.ts` (the AWS S3 SDK pointed at the R2 endpoint). Uploads need an R2 S3 API token — `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` (defaults to `mukoko-storage`); when unset the route returns 503 and the create-event form falls back to a gradient cover.

### nhimbe MCP (`worker/` → `nhimbe-mcp`)

The `worker/` directory is now a single-purpose **task-based MCP server** (`nhimbe-mcp`) — the legacy REST backend, Supabase reads, Paynow, Resend email and queues were all stripped out. It is a stateless Streamable-HTTP MCP server (JSON-RPC 2.0, fetch-native, `hono`; no data of its own) deployed behind the nhimbe zone at **`nhimbe.com/mcp/*`** — the zone is Cloudflare-proxied (orange cloud) in front of Vercel, and the Worker route intercepts `/mcp/*` while everything else passes through to the app.

- **Tools** (`worker/src/mcp/`): `events_near_me`, `events_matching_interests`, `get_event` (anonymous reads) and `create_event`, `update_event` (WorkOS-gated). Each returns **inline HTML** — a carousel for multiple events, a single card for one — plus a text fallback.
- **No data ownership.** Every tool calls the nhimbe app API (`APP_API_URL`, `https://nhimbe.com`). Reads hit the public `/api/events*` endpoints; writes hit `POST /api/events` / `PATCH /api/events/:id`, which the worker reaches by forwarding the caller's WorkOS **bearer** token. The app verifies the token (`src/lib/auth/workos-token.ts` → JWKS) and is the single trust boundary. **No autonomous/agent tools yet** — deliberately future work.

Cloudflare is otherwise used only for R2 storage and the Shamwari AI Gateway. Transactional email now runs **on the app** (`src/lib/email/`, Resend) — the worker no longer sends mail. Supabase, PostgREST, and any dependency on `api.mukoko.com` have been removed from the app.

## Frontend Structure

### Pages (`src/app/`)

- Home (`page.tsx` + `home-client.tsx`), events (create/detail/manage), my-events, profile, map, admin.
- Auth: `/auth/*`, `/callback` (WorkOS post-auth landing), `/authenticate` (legacy redirect → `/`).
- Info: search, calendar, about, help, privacy, terms.
- Short links: `/e/[shortCode]` (events), `/r/[code]` (referral tracking).
- Kraal (community circles): `/kraal`, `/kraal/[id]`.
- Signage/kiosk: `/signage`, plus event sub-pages `/events/[id]/kiosk` and `/events/[id]/signage`.
- SEO: `robots.ts`, `sitemap.ts`; error boundaries `error.tsx`, `global-error.tsx`, `not-found.tsx`, `loading.tsx`.

### UI Components (Mukoko Registry)

shadcn/Radix primitives installed from the Mukoko registry (`registry.mukoko.com`), configured in `components.json` (new-york style, RSC, Tailwind v4, Lucide icons). All primitives use `data-slot` attributes, CVA variants, and Radix for accessibility. In `src/components/ui/`: core primitives (button, card, dialog, drawer, tabs, select, form, table, empty, …) plus Mukoko-exclusive composites (rating, stats-card, filter-bar, status-indicator, timeline, copy-button, file-upload, share-dialog, lazy-section, detail-layout, responsive-modal, share-button, QR code, community-insights, city-dropdown, theme-toggle, verified-badge, …).

#### nyuchi-harness (`src/components/ui/harness.tsx`)

The infrastructure spine the mzizi-branded component library compiles against. It **unifies nhimbe's existing infra modules** behind one contract rather than re-implementing them — observability (`src/lib/observability.ts`), a11y announcements (`src/components/ui/live-region.tsx`), error resilience (`src/components/error/section-error-boundary.tsx`), and skeleton loading (`src/components/ui/skeleton.tsx`). Motion is token-driven (`--motion-duration-*` / `--motion-ease-*`, with fallbacks) and honours `prefers-reduced-motion`; shared entry keyframes are injected at runtime so `globals.css` stays owned by the design-system PR. Two entry points:

- **`NyuchiHarness`** — declarative section wrapper: `<NyuchiHarness name="feed" loading skeleton={…} fallback={…}>…</NyuchiHarness>` (error boundary + skeleton + render-timing log + entry animation + a11y roles).
- **`useNyuchiHarness(name)`** — imperative hook for leaf brand components, returning `{ log, motion, animStyle, prefersReducedMotion, locale, theme, reportHealth, announce, announceUrgent }`. Also exports the standalone `animStyle()` / `prefersReducedMotion()` helpers.

`verified-badge.tsx` (trust-tier verification badge; tanzanite top tier) is the first brand component wired to it. New brand components should consume the harness rather than touching the underlying modules directly.

#### nyuchi event components (ported from mzizi)

The mzizi events-domain brand components, ported into `src/components/ui/` and each wired through the harness (`useNyuchiHarness`) for observability, reduced-motion entry animation, and a11y:

- **`nyuchi-listing-card.tsx`** (`NyuchiListingCard`) — the foundational universal listing card, variants `row` / `compact` / `hero`, with a mineral category accent. **Replaces `event-card` / `event-card-horizontal` at the home feed, events listing, my-events (hosting/past), and calendar agenda.** (`event-card*.tsx` remain only for the signage + map surfaces that still import them.)
- **`nyuchi-rsvp-button.tsx`** (`NyuchiRSVPButton`) — stateful RSVP pill (none/pending/confirmed/waitlisted/declined) with a capacity indicator; wired into the event-detail sidebar (`events/[id]/rsvp-button.tsx`) over the existing `rsvpToEvent` action.
- **`nyuchi-ticket-card.tsx`** (`NyuchiTicketCard`) — digital ticket (QR area, tier, status); rendered on the my-events **Attending** tab.
- **`nyuchi-programme-item.tsx`** (`NyuchiProgrammeItem`) — timeline agenda row; renders the event-detail programme (`events/[id]/event-specifics.tsx`).
- **`nyuchi-calendar.tsx`** (`NyuchiCalendar`) — branded month view with mineral event-dots + an agenda render-prop; powers `/calendar` (the shadcn `calendar` primitive stays for form date-pickers).
- **`nyuchi-create-listing.tsx`** — create/edit form shell (`CoverThemePicker`, `FormSection`, `FormRow`, `FormTextArea`, `PublishBar`, `CreateHeader`); the create-event wizard adopts `PublishBar` for its sticky CTA without replacing its state or the `createEvent` action.

Per-event mineral accents come from **`src/lib/category-mineral.ts`** (`categoryToMineral`), keyword-matched with a **tanzanite** default so the brand lead is always the fallback face. `nyuchi-forecast-card` was intentionally **not** ported: nhimbe's weather is the Mukoko iframe embed (`weather-embed.tsx`, `src/lib/weather.ts`) — a presentational forecast shell has no structured data to bind, so duplicating it was skipped.

### Components (`src/components/`)

- `ui/` — primitives + domain composites.
- `auth/` — `auth-context.tsx`, `workos-provider.tsx`, `auth-guard.tsx` (+ tests).
- `modals/` — ResponsiveModal sheets (category, date, location, capacity, description, ticketing).
- `prompts/` — onboarding (name, location, interests).
- `layout/` — header, footer.
- `error/` — `section-error-boundary.tsx` (Mukoko 3-layer error boundary with retry).
- `pwa/` — service worker registration.
- `theme-provider.tsx` — dark/light mode context.

### Frontend Libraries (`src/lib/`)

- `api.ts` — same-origin REST client (fallback path) + `getMediaUrl` + `uploadMedia`.
- `mongo/` — server-side MongoDB layer (see above).
- `ai/` — Shamwari gateway client + event embedding index.
- `r2.ts` — server-only Cloudflare R2 uploader (S3 SDK) for cover images.
- `email/` — Resend transactional email client + templates (`server-only`).
- `auth/dev.ts` — dev auth bypass.
- `shamwari.ts` — Shamwari assistant helpers.
- `map/tiles.ts` — shared OpenStreetMap base-layer config (Leaflet tiles + attribution), used by the discovery map and the per-event venue map.
- `weather.ts` — Mukoko weather-embed helpers (`slugifyLocation`, `weatherEmbedUrl`) for the `weather.mukoko.com/embed/widget` iframe (+ tests).
- `calendar.ts`, `timezone.ts` — date/time utilities (+ tests).
- `fallback-chain.ts` — resilient data-loading fallback pattern.
- `use-focus-trap.ts`, `use-tracked-link.ts`, `use-save-event.ts` — hooks.
- `themes.ts` — mineral theme definitions.
- `category-mineral.ts` — `categoryToMineral()` event-category → mineral accent map (tanzanite default) for the branded nyuchi event components (+ tests).
- `observability.ts` — frontend structured logging (`[mukoko]` prefix).
- `i18n/` — lightweight custom i18n (`t()`, `setLocale()`, `getLocale()`); English (default) + Shona.
- `utils.ts` — shared helpers incl. `cn()` (+ tests).

### Hooks (`src/hooks/`)

- `use-mobile.ts`, `use-toast.ts` (wraps sonner), `use-memory-pressure.ts`.

### PWA

Service worker at `public/sw.js` — cache-first for static assets, network-first for API calls. Registered in production via `src/components/pwa/sw-register.tsx`.

### State Management

React Context only — `AuthProvider` (user state) and `ThemeProvider` (dark/light). No Redux/Zustand.

## Testing

Vitest with jsdom + React plugin (`vitest.config.ts`, setup in `src/__tests__/setup.ts`). Tests colocate with modules or live in `src/__tests__/`. Run with `npm run test:run` (~212 tests). Covered areas include the API client, utils, calendar/timezone, auth context/guard, SEO metadata, accessibility, and the Mongo mappers (`src/lib/mongo/mappers.test.ts`).

## Key Files

| File                                              | Purpose                                                        |
| ------------------------------------------------- | -------------------------------------------------------------- |
| `src/app/page.tsx`                                | Home — SSR reads MongoDB directly                              |
| `src/app/events/[id]/page.tsx`                    | Event detail — SSR                                             |
| `src/proxy.ts`                                    | Next.js 16 AuthKit proxy (session cookies)                     |
| `src/lib/mongo/client.ts`                         | Cached MongoDB client (`server-only`)                          |
| `src/lib/mongo/databases.ts`                      | `DB` names + typed collection accessors                        |
| `src/lib/mongo/mappers.ts`                        | Mongo doc → schema.org API shape                               |
| `src/lib/mongo/search.ts`                         | Atlas `$vectorSearch` over `events.eventEmbeddings`            |
| `src/lib/ai/gateway.ts`                           | Shamwari Cloudflare AI Gateway client (Qwen + BGE)             |
| `src/app/actions/ai.ts`                           | AI description wizard server action                            |
| `src/lib/auth/dev.ts`                             | Local dev auth bypass                                          |
| `src/lib/api.ts`                                  | Same-origin REST client + `getMediaUrl`                        |
| `src/lib/observability.ts`                        | Frontend structured logging (`[mukoko]`)                       |
| `src/lib/i18n/index.ts`                           | i18n translations (English + Shona)                            |
| `src/lib/themes.ts`                               | Mineral theme definitions                                      |
| `src/components/auth/auth-context.tsx`            | Auth state management                                          |
| `src/components/auth/workos-provider.tsx`         | AuthKit provider wrapping the app                              |
| `src/components/error/section-error-boundary.tsx` | Mukoko 3-layer error boundary                                  |
| `CONTRIBUTING.md`, `SECURITY.md`, `RELEASES.md`   | Contribution guidelines, security policy, release notes        |

## Workflow Conventions

- **Big PR, multiple commits** — the Nyuchi house style. Related work lands in one pull request as a sequence of focused, independently readable commits. Don't open a second PR for "just one more cleanup" — append a commit to the active branch.
- **Branches** — work on `claude/<topic>-<slug>` branches; push with `-u origin <branch>` and open the PR as a draft until ready for review.

## Code Conventions

- **Brand**: always lowercase "nhimbe" — even at sentence start.
- **TypeScript strict mode**.
- **Server-side data only** — MongoDB access is guarded by `import "server-only"`; never touch the driver from client components.
- **Tailwind CSS v4** with the `cn()` helper from `src/lib/utils.ts`.
- **React Context** for global state (AuthProvider, ThemeProvider) — no Redux/Zustand.
- **`"use client"`** directive required for interactive components.
- **WCAG AAA** — 7:1+ contrast for primary/secondary text, 44px touch targets.
- **Dark/light modes** via `.dark`/`.light` classes, design tokens in `globals.css`.
- **Design tokens follow the mzizi doctrine 4.1.0** (`src/app/globals.css`, guarded by `src/__tests__/design-tokens.test.ts`), applied **additively** with deliberate nhimbe divergences:
  - **Pill inputs (the 4.1.0 headline):** `--radius-button` and `--radius-input` are `9999px` — Button, Input and the Select trigger render as **pills** (`rounded-full`); Textarea uses `rounded-2xl` (17px) to avoid a growing-stadium artifact. Per-component radii: card 14px (`--radius-lg`), dialog/tabs 17px (`--radius-xl`), checkbox 7px (`--radius-sm`). `--radius-base` (14) / `--radius-2xl` (17) are doctrine aliases.
  - **tanzanite stays the brand `--primary`** in every theme (cobalt is the "exceptional" mineral for links/info only — `--nh-secondary`/`--info`). Do **not** switch `--primary` to cobalt.
  - **Compact touch-target scale is intentional** (`--touch-target-lg: 48px` / `40px` / `34px`); blanket min-heights are deliberately **not** enforced (see the comment in `globals.css`). Control heights are token-driven (`--h-button-default`/`--h-button-sm`/`--h-input`, currently 36/32/36) — the single knob to adopt the doctrine's 56/48 later without touching components.
  - Extended spacing ladder (`*-plus` half-steps, `--space-4xl/5xl/6xl`), type tokens (`--fs-display-sm/h6/code`), the `--font-mono` (JetBrains Mono, loaded via `next/font` in `layout.tsx`), shadow rungs (`--shadow-none/xs/inner/focus-ring`), and motion aliases (`--motion-duration-*`, `--motion-ease-spring`, `--motion-stagger-*`) are all present.
- **Schema.org alignment** — events and users modeled after schema.org specs.
- **Structured logging** — `[mukoko]` prefix on all log output.
- **Path alias** — `@/*` maps to `./src/*`.

## Environment Variables

Set in Vercel (prod + preview) and locally in `.env.local`:

- `MONGODB_URI` — MongoDB connection string (required; prod + preview).
- `WORKOS_CLIENT_ID` — WorkOS Client ID (server-only; no `NEXT_PUBLIC_` prefix).
- `WORKOS_API_KEY` — server-only, used by the AuthKit proxy.
- `WORKOS_COOKIE_PASSWORD` — server-only session-cookie encryption key (≥32 chars).
- `WORKOS_API_HOSTNAME` *(optional)* — defaults to `api.workos.com`; set to `identity.nyuchi.com` to route WorkOS calls (and the hosted AuthKit UI) through the Nyuchi custom domain.
- `NEXT_PUBLIC_WORKOS_REDIRECT_URI` — usually `${NEXT_PUBLIC_SITE_URL}/callback`. The `NEXT_PUBLIC_` prefix is **required** — AuthKit reads it from the client bundle to form the OAuth start URL.
- `SHAMWARI_AI_GATEWAY_URL`, `SHAMWARI_AI_GATEWAY_TOKEN` — Cloudflare AI Gateway base + provider bearer; optional `SHAMWARI_AI_GATEWAY_AUTH_TOKEN` for the authenticated gateway.
- `RESEND_API_KEY` — server-only; used for transactional email via Resend (`src/lib/email/`). Sends from the verified `notify.mukoko.com` domain (`events@notify.mukoko.com`). When unset, email sends are skipped (never throw).
- `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` — server-only R2 S3 API credentials for cover-image uploads (`src/lib/r2.ts`). `R2_BUCKET` *(optional)* defaults to `mukoko-storage`. When unset, `/api/media/upload` returns 503 and uploads fall back to a gradient cover.
- `NEXT_PUBLIC_SITE_URL` — public site URL.
- `NEXT_PUBLIC_ASSETS_URL` *(optional)* — override the R2 assets host (defaults to `https://assets-s001.mukoko.com`).

Maps, address search and weather need **no API keys**: maps render **Leaflet + OpenStreetMap** tiles client-side (`src/lib/map/tiles.ts`), address geocoding is **DB-first (`places.places`) then OSM Nominatim** server-side (`src/app/actions/geocode.ts`), and weather is the shared **Mukoko embed** (`weather.mukoko.com/embed/widget`, `src/lib/weather.ts`) — replacing the former Google Maps + wttr.in stack. `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` has been removed; delete it from Vercel.

**Intentionally unset**: `NEXT_PUBLIC_API_URL` — the API is same-origin. There are **no** Supabase/Postgres environment variables.
