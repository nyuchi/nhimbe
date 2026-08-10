# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Nhimbe** (pronounced /ˈnhimbɛ/) — community events discovery and management platform, part of the Mukoko ecosystem. It is a single full-stack **Next.js 16** app (App Router, React 19, TypeScript strict, Tailwind v4) deployed on **Vercel** — there is no separate application backend. Data lives in **MongoDB** (the Mukoko v3.1 cluster) and is read/written **server-side only** via the official `mongodb` driver. Auth is **WorkOS AuthKit** end-to-end. AI ("Shamwari") runs through the **Cloudflare AI Gateway**; media is stored in **Cloudflare R2**.

MCP note: the **Mukoko Events MCP** server — a task-based MCP served **only** at `events.mukoko.com/mcp` — now lives in its **own repo, `nyuchi/mukoko-events-mcp`** (it was extracted from this repo's former `worker/` directory in issue #100). It is **not** part of the app request path (feature work lives in `src/`); it calls the app's public `/api/events*` endpoints and forwards WorkOS bearer tokens for writes. The distributable consumer surfaces (Claude Code plugin, marketplace, ChatGPT connector, and the consumer Agent Skills) travel with that repo.

Admin note: the admin dashboard — **Mukoko Events Admin** — is a **separate Next.js app in its own repo, `nyuchi/mukoko-events-admin`** (extracted in issue #100), deployed as its **own Vercel project** (canonical domain `admin.events.mukoko.com`; `admin.nhimbe.com` stays as a legacy alias). The public app has **no `/admin` routes** — `/admin*` redirects there (see the `ADMIN_URL` redirect in `next.config.ts`).

## Build & Dev Commands

```bash
# From the repo root
npm install
npm run dev          # Dev server at http://localhost:11825
npm run build        # Production build (Next.js)
npm run lint         # ESLint

# Tests (Vitest)
npm run test         # Watch mode
npm run test:run     # Run once (~887 tests) — unit only, all I/O mocked
npm run test:integration   # Against a REAL MongoDB (mongodb-memory-server)
npm run test:coverage
npx vitest run src/lib/api.test.ts   # Single test file
```

The Mukoko Events MCP server (`nyuchi/mukoko-events-mcp`) and the Mukoko Events
Admin app (`nyuchi/mukoko-events-admin`) are separate repos with their own
build/dev/test commands — they are no longer part of this repo.

Database: MongoDB collections/validators are owned by the Mukoko platform, not this repo. Nhimbe only reads/writes documents via the `mongodb` driver (`src/lib/mongo/`). There are no migrations in this repo.

## CI Pipeline

GitHub Actions:

- **`lint.yml`** — org reusable lint workflow (actionlint, JSON validity, prettier, markdownlint, yamllint).
- **`ci.yml`** — Lint & Build (`npm run lint` + `npm run build` with placeholder env vars) and Frontend Tests (`npm run test:run`). Covers the public Nhimbe app only; the Mukoko Events MCP server and Admin app have their own CI in their own repos.
- **CodeQL** — security scanning.

Vercel builds and deploys every commit (preview per branch, production on `main`).

## Architecture

### SSR-first, MongoDB server-side

The default data path is **server-side rendering**: React Server Components read MongoDB directly through the driver. Examples: `src/app/page.tsx` (home), `src/app/events/page.tsx` (listing), `src/app/events/[id]/page.tsx` (detail). Writes go through **Server Actions** (`src/app/actions/`). The browser **never** connects to MongoDB — `import "server-only"` guards the Mongo layer.

The internal API at **`nhimbe.com/api`** (route handlers in `src/app/api/`) is a same-origin **fallback** for client-triggered needs, not the primary path. `NEXT_PUBLIC_API_URL` is intentionally **unset** so `src/lib/api.ts` calls the same origin.

**Realtime** read/sync (live engagement, kiosk pairing, QR check-in, live online-event counts) is a **future** addition — it is not viable on Vercel serverless yet, so those surfaces currently use SSR plus polling.

### Dual-domain (nhimbe.com + events.mukoko.com)

Production is **dual-domain**: both `nhimbe.com` and `events.mukoko.com` fully serve the app (Vercel serves both). Runtime behaviour is identical on either host because the browser always talks to its own origin — client calls are same-origin (`NEXT_PUBLIC_API_URL` unset; `src/lib/api.ts` and share/tracked links use `window.location.origin`). What is **consolidated onto one primary origin** is every self-referential URL search engines and scrapers consume — canonical tags, OpenGraph/Twitter image URLs, `sitemap.xml`, `robots.txt`, schema.org JSON-LD, and the `.well-known` OAuth `resource` — so SEO signals don't split across both domains (duplicate content). That primary origin is **`events.mukoko.com`**, resolved once in **`src/lib/site-url.ts`** (`SITE_URL` / `absoluteUrl()`, overridable via `NEXT_PUBLIC_SITE_URL`); nothing else should hardcode a site origin. Opaque stable identifiers are deliberately **not** routed through it (iCalendar UIDs stay `…@nhimbe.com`; the Nominatim `User-Agent` stays a fixed contact string). Operationally: both domains must be added to the Vercel project, and both `…/callback` URLs registered in WorkOS, with `NEXT_PUBLIC_WORKOS_REDIRECT_URI` pointing at the primary.

### MongoDB layer (`src/lib/mongo/`)

Connection lives in `client.ts` — a cached `MongoClient` (no caching of rejected connection promises). Documents follow the Mukoko v3.1 conventions: string-UUID `_id`, `_schemaVersion`, camelCase fields, BSON dates, and JSON-Schema validators enforced by the cluster.

| File                    | Purpose                                                                 |
| ----------------------- | ----------------------------------------------------------------------- |
| `client.ts`             | Cached `MongoClient` connection (`server-only`)                         |
| `databases.ts`          | `DB` database-name map + typed collection accessors                     |
| `events.ts`             | Event reads/writes                                                      |
| `event-filters.ts`      | Shared published-and-visible predicates behind both listings and `/discover` counts (count/drill-down parity) |
| `lookups.ts`            | Categories, cities, community stats                                     |
| `engagement.ts`         | Reviews (incl. submit), ratings, referrals, host reputation (global engagement) |
| `interactions.ts`       | Saves + likes on the shared substrate (`engagement.interactions` save rows, `engagement.reactions` LikeAction) |
| `update-subscribers.ts` | Recipient resolution for host-update emails (RSVP + team, opt-out aware) |
| `tracked-links.ts`      | `engagement.trackedLinks` writer/reader — host referral short links (`/r/<slug>`) + click counts |
| `circles.ts`            | Circle **community** reads (schema.org OnlineCommunityGroup in `circles.circles`) |
| `stats.ts`              | Aggregated analytics                                                    |
| `kiosk.ts`              | Kiosk/device pairing                                                    |
| `host-registrations.ts` | Host-side registration reads                                            |
| `admin.ts`              | Admin dashboard queries (consumed by the standalone `nyuchi/mukoko-events-admin` app) |
| `admin-types.ts`        | Client-safe admin row/tile types (no `server-only`)                     |
| `settings.ts`           | `system.platformSettings` singleton (Nhimbe-owned platform config)     |
| `entities.ts`           | Host entities and memberships                                           |
| `users.ts`              | `identity.persons` (WorkOS user mirror)                                 |
| `calendars.ts`          | Calendars (NYU-25): create/reads, idempotent follows, event attach (+ tests) |
| `planner.ts`            | RSVP → `planner.reservations` write-through (+ `planner.test.ts`)       |
| `campfire.ts`           | Event update → Campfire system-message write-through (+ tests)          |
| `mappers.ts`            | Mongo doc → schema.org-aligned API shape (with `mappers.test.ts`)       |
| `search.ts`             | Atlas `$vectorSearch` retrieval over `events.eventEmbeddings`           |
| `types.ts`, `ids.ts`    | Doc types; ID/short-code/slug generation                               |
| `index.ts`              | Barrel re-export of the data layer (server runtime only)               |

Databases (`DB` map): `events`, `identity`, `entity`, `engagement`, `places`, `circles`, `campfire`, `planner`, `device`, `wallet`, `system`.

### Cross-product write-through (NYU-26)

Nhimbe feeds the Mukoko super app — two best-effort mirrors run server-side **after** the primary write succeeds and **never throw** (failures are logged via the `[mukoko]` logger and swallowed, same contract as `src/lib/email/resend.ts`):

- **RSVP → Planner** (`src/lib/mongo/planner.ts`): `rsvpToEvent` upserts a schema.org `EventReservation` into `planner.reservations`, keyed idempotently by `(reservedPersonId, event iCalUid)`. RSVP yes → `ReservationConfirmed`, maybe → `ReservationHold`, no / host cancellation (`cancelRegistration`) → `ReservationCancelled` (cancellation updates without upsert). `partySize` = 1 + additional guests; `reservationFor` carries an event snapshot.
- **Event update → Campfire** (`src/lib/mongo/campfire.ts` + `src/app/actions/event-updates.ts`): `postEventUpdate` (host-gated) writes `events.updates`; with `notifyAttendees: true` it find-or-creates the event's paired `campfire.conversations` doc (`conversationType: "system"`, `encryptionMode: "none"`, `mukoko.routingSource: "nhimbe"`) and appends the text as a plaintext system message whose `sequence` is claimed atomically via `$inc: { messageCount: 1 }`. Additive to (not replacing) the transactional emails; the live event chat in `src/app/actions/campfire.ts` keeps owning user-authored messages.

### Data model (entity-centric hosting)

Hosting is **entity-centric**: `events.events.primaryHostEntityId` → `entity.entities` → `identity.persons` (via memberships / `founderPersonId`). Places live in `places.places`; circle **communities** (schema.org OnlineCommunityGroup — not calendars) in `circles.*`, with `events.events.circleId` marking events hosted within a circle.

**Calendars (NYU-25)** are followable, curated **event streams** (the Luma "calendar" pattern) — distinct from circles: a circle is a community you *join* (members), a calendar is a stream you *follow* (followers). They live in `events.calendars` (owner person+entity, `visibility` public/unlisted/private, optional `circleId` when a circle owns the stream, optional washed `theme`, denormalized `followerCount`/`eventCount`) with `events.calendarFollows` (one row per calendar+person, `isActive` flipped in place — follows never double-count) and `events.events.calendarId` marking which calendar an event streams into. `src/lib/mongo/calendars.ts` owns the writes; surfaces: `/calendars/[slug]` (SSR page + `/ics` feed), a "Featured calendars" `/discover` section, and an optional attach select in the create-event wizard.

### Engagement (global cross-platform substrate)

`engagement.*` collections (reviews, ratings, referrals, comments, reactions, trackedLinks, …) are **shared across all Mukoko products**, not owned by Nhimbe. Event-scoped queries filter by `targetReferenceType: "event"` and `targetProductId: <eventId>`. Engagement primitives (reviews, likes/reactions, saves, comments) are universal across content types; **events additionally add RSVPs and check-ins**. **End-to-end encryption is disabled** — reviews/ratings carry plaintext bodies.

### Server Actions (`src/app/actions/`)

Mutations and client-invoked reads: `auth`, `events`, `event-updates`, `discovery`, `my-events`, `registrations`, `host-registrations`, `host-entities`, `host-card`, `kiosk`, `engagement`, `saves`, `waitlist`, `search`, `profile`, `circles`, `circle-detail`, `calendars`, `campfire`, `places`, `map-places`, `geocode`, `polls`, `programme`, `badges`, `tracked-links`, `ai`.

### Route Handlers (`src/app/api/`)

Same-origin fallback endpoints: `events`, `events/[id]` (both also take bearer-authed `POST`/`PATCH` for the MCP), `categories`, `cities`, `community/stats`, `health` (liveness + Mongo dependency probe — `200 ok` / `503 down`, `X-Health-Status` header, `HEAD` for cheap polling; shaped like kweli's `/api/health` so one monitor config covers both, and necessary because every Mongo read degrades to empty rather than throwing, so a `200` on `/` is NOT evidence the app is healthy), `og` (OG image), `media/upload` (WorkOS-gated cover-image upload to R2), `webhooks/workos` (guaranteed user provisioning — see Authentication Flow), and `auth/dev-login` (local dev bypass only). Auth itself is handled by the hosted-AuthKit entry route `/auth/hosted` (redirects to WorkOS) and `/callback` — see the Authentication Flow section.

**Agent-readiness discovery** — three `.well-known` route handlers (`src/app/.well-known/*/route.ts`, all `force-dynamic`, `Access-Control-Allow-Origin: *`) advertise the **WorkOS AuthKit OAuth 2.1 authorization server** (`accounts.mukoko.com/oauth2/*`) from the Nhimbe origin so MCP agents/clients can run standard discovery: `oauth-authorization-server` (RFC 8414 — authorize/token/JWKS **plus the DCR `registration_endpoint`**), `oauth-protected-resource` (RFC 9728 — Nhimbe as resource server, pointing at `/auth.md`; its `resource` is derived from the request host so the doc self-identifies correctly whether served on `nhimbe.com` or `events.mukoko.com`), and `openid-configuration` (OIDC Discovery 1.0, RS256). All four surfaces (these three + `/auth.md`) derive their endpoints from the single helper `src/lib/auth/workos-metadata.ts` (`WORKOS_AUTHKIT_DOMAIN` / `WORKOS_ISSUER`, default `accounts.mukoko.com`) — the AuthKit domain that serves its own self-consistent metadata and DCR. This is deliberately **not** the API domain in the RFC 9728 `authorization_servers` pointer: `auth.mukoko.com` serves no authorization-server metadata (a client following a pointer there 404s and the flow dead-ends). WorkOS remains the real authorization server; these endpoints just advertise it. The bearer-token **verifier** (`workos-token.ts`) independently reads JWKS from the **API** domain (`WORKOS_API_HOSTNAME` → `/sso/jwks/{clientId}`); advertising the AuthKit domain while verifying against the API domain is safe because a WorkOS environment signs every access token with one key, published (identical `kid`) at both hosts, and the verifier pins only signature + expiry + subject.

### Authentication Flow (WorkOS AuthKit — hosted UI)

Auth uses **WorkOS's hosted AuthKit UI**. Nhimbe no longer ships a self-hosted sign-in page or headless User Management routes — every "Sign in" / "Sign up" affordance links to the entry route **`/auth/hosted`** (`src/app/auth/hosted/route.ts`), which builds the hosted URL and redirects to WorkOS:

- **Sign in** — `getSignInUrl({ returnTo })`; **Sign up** — `getSignUpUrl({ returnTo })` via `?screen=sign-up`. The route is a Route Handler (not an RSC) because these writers set PKCE/state cookies. `return_to` is a deep-link back into the app after login, clamped to a same-origin absolute path by `safeReturnTo` (`src/lib/auth/return-to.ts`) so it can never be an open redirect (rejects `//host`, `/\`, external URLs). A missing/misconfigured WorkOS env yields a clear **503**.
- The **hosted UI owns all methods** — email code, password, **MFA (TOTP)**, **passkeys** and **social login** are configured in the WorkOS dashboard, not in our code. (This replaces the former self-hosted magic/password/MFA-OTP/SSO surface, which is gone.)
- After the user authenticates, WorkOS redirects to **`/callback`** (`handleAuth`) which exchanges the code for a session and sets the encrypted session cookie. Its `onSuccess` hook synchronously upserts the user into `identity.persons` (wrapped/never-throw — a Mongo failure can never break login).

`src/lib/auth/workos-token.ts` verifies bearer access tokens (for the MCP write endpoints) — a separate trust boundary, untouched by the hosted migration.

- `src/proxy.ts` — Next.js 16 proxy (was middleware in <=15); manages AuthKit session cookies. Guards a missing-env misconfig with a 503 on `/auth/*` and `/callback`.
- `withAuth()` from `@workos-inc/authkit-nextjs` gives server components/actions the current user.
- **Guaranteed user provisioning (issue #70)** — three layers, all converging on the same idempotent `syncPersonFromWorkos` upsert (keyed on `workosUserId`):
  1. **Webhook (push)** — `POST /api/webhooks/workos` (`src/app/api/webhooks/workos/route.ts`, nodejs runtime) verifies the `workos-signature` header over the raw body via the SDK (`WORKOS_WEBHOOK_SECRET`; unset → 503, bad/missing signature → 401, never logged). `user.created|updated` → `identity.persons` upsert; `user.deleted` → soft-deactivate (`isActive: false`, never a hard delete); `organization_membership.created|updated|deleted` → mirrored onto `entity.memberships` via `mirrorWorkosOrganizationMembership` (`src/lib/mongo/entities.ts`) — the join keys are the validator-permitted extras `entity.entities.workosOrganizationId` (org, first sight find-or-creates a minimal organization entity) and `entity.memberships.workosOrganizationMembershipId`. Unknown WorkOS role slugs degrade to `member`; only `status: "active"` yields an active membership. Handled/ignored events answer 200; a failed mirror answers 500 so WorkOS retries (handlers are idempotent keyed upserts).
  2. **Callback (synchronous)** — the `/callback` `onSuccess` upsert above, at the moment the code exchange succeeds.
  3. **Lazy sync (fallback)** — the `AuthProvider` (`syncCurrentUser` server action) and `resolveActingPerson` (`src/lib/auth/current-person.ts`) both resolve the session via `withAuth()` and lazily upsert the WorkOS user into `identity.persons` on the first render/action after login (unchanged).
- `src/lib/auth/dev.ts` + `/api/auth/dev-login` — local dev auth bypass (kept).
- `/callback` is the canonical post-auth landing; `/authenticate` is a legacy redirect → `/`.

> **WorkOS environment alignment (critical):** `WORKOS_API_KEY`, `WORKOS_CLIENT_ID`, the `auth.mukoko.com` custom **API** domain (`WORKOS_API_HOSTNAME`), and the `accounts.mukoko.com` hosted **AuthKit UI** domain **must all belong to the same WorkOS environment**. Two distinct domains: `auth.mukoko.com` serves the WorkOS API (authorize/token/JWKS — what the SDK and token verifier call), while `accounts.mukoko.com` serves the hosted sign-in UI (configured in the WorkOS dashboard). A key/client-id/domain split across environments makes the hosted redirect succeed but the callback code exchange fail.

### AI — Shamwari (`src/lib/ai/`)

AI runs through the **Cloudflare AI Gateway** (server-side only, `src/lib/ai/gateway.ts`):

- **Generation**: Qwen (`@cf/qwen/qwen3-30b-a3b-fp8`) — powers the description wizard (`src/app/actions/ai.ts`) and the Shamwari assistant.
- **Embeddings**: BGE (`@cf/baai/bge-base-en-v1.5`, 768-dim).
- **Retrieval**: MongoDB **Atlas Vector Search** — `$vectorSearch` over `events.eventEmbeddings` (`src/lib/mongo/search.ts`, index `event_vector_index`). Event embedding maintenance in `src/lib/ai/event-index.ts`.

Env: `SHAMWARI_AI_GATEWAY_URL`, `SHAMWARI_AI_GATEWAY_TOKEN`, and optional `SHAMWARI_AI_GATEWAY_AUTH_TOKEN` (only for the authenticated gateway).

### Storage — Cloudflare R2

Media lives in the **shared** Mukoko bucket `mukoko-storage`, served at `assets-s001.mukoko.com` (`getMediaUrl` in `src/lib/api.ts`, overridable via `NEXT_PUBLIC_ASSETS_URL`) — **not** a per-app silo. Reads need no credentials. **Uploads** (event cover images) go through `POST /api/media/upload` (WorkOS session-gated; validates image type + 4 MB) which writes to `mukoko-storage` via `src/lib/r2.ts` (the AWS S3 SDK pointed at the R2 endpoint). Uploads need an R2 S3 API token — `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` (defaults to `mukoko-storage`); when unset the route returns 503 and the create-event form falls back to a gradient cover.

### Mukoko Events MCP (separate repo: `nyuchi/mukoko-events-mcp`)

The task-based MCP server that ships to agents at **`events.mukoko.com/mcp`** lives in its **own repo, `nyuchi/mukoko-events-mcp`** (extracted from this repo's former `worker/` directory in issue #100, along with its distribution surfaces — the Claude Code plugin, the `.claude-plugin/marketplace.json`, the ChatGPT connector, and the consumer Agent Skills). It owns no data: every tool calls the Nhimbe app API — reads hit the public `/api/events*` endpoints; writes hit `POST /api/events` / `PATCH /api/events/:id`, forwarding the caller's WorkOS **bearer** token. **The app is the single trust boundary** — it verifies the token (`src/lib/auth/workos-token.ts` → JWKS). Nhimbe's only responsibility here is to keep those API endpoints and the `.well-known` / `auth.md` agent-discovery surfaces stable; the tool definitions, protocol handling, and deploy all live in the MCP repo.

Cloudflare is otherwise used only for R2 storage and the Shamwari AI Gateway. Transactional email runs **on the app** (`src/lib/email/`, Resend). Supabase, PostgREST, and any dependency on `api.mukoko.com` were removed from the app.

## Mukoko Events Admin (separate repo: `nyuchi/mukoko-events-admin`)

The admin dashboard — **Mukoko Events Admin** — is a **standalone Next.js app in its own repo, `nyuchi/mukoko-events-admin`** (extracted in issue #100), deployed as its **own Vercel project** (canonical domain `admin.events.mukoko.com`; `admin.nhimbe.com` is a legacy alias). The public app ships **no admin surface** — `next.config.ts` redirects `/admin*` to the admin app (`ADMIN_URL`, default `https://admin.events.mukoko.com`; `/admin/users` maps to `/people`), and `src/__tests__/admin-redirect.test.ts` guards that redirect.

- **Shared Mongo read layer stays here.** The admin app's admin *reads* are the shared `src/lib/mongo/admin.ts` (server-only) with client-safe row types in `src/lib/mongo/admin-types.ts` (no `server-only`); these remain in this repo and are consumed by the admin app. The admin gate, section shells, server actions, and its own auth plumbing (`proxy.ts`, `/callback`, `NEXT_PUBLIC_WORKOS_REDIRECT_URI`, the nyuchi entity-membership scoping via `NYUCHI_ADMIN_ENTITY_ID` / `WORKOS_ADMIN_ORG_ID`) all live in the admin repo.
- Deploy/env details live in the admin repo's README.

## Frontend Structure

### Pages (`src/app/`)

- Home (`page.tsx`) — **split server-side on auth** (NYU-24 IA): logged out → a lean landing (`home-landing.tsx`: serif hero, one CTA into `/discover`, city chips, ≤1 featured event — no feed); signed in → "Your events" (`home-your-events.tsx`: Upcoming/Past segmented control over the member's RSVPs + hosted gatherings via `getMyEvents`).
- Discover (`/discover`) — the **browse** surface: category tiles → featured circles → featured calendars → city cards (`discover-browse.tsx`), each linking into a scoped drill-down. Never a feed.
- Events (`/events`) — the **all-events drill-down timeline**, scopeable via `?category=<slug>` / `?city=<addressLocality>` query params (the drill-down routing choice — no parallel `/discover/[category]` tree); plus create/detail/manage. Also my-events, profile, map. (Admin moved to the standalone `nyuchi/mukoko-events-admin` app — `/admin*` only redirects.)
- Auth: `/auth/*`, `/callback` (WorkOS post-auth landing), `/authenticate` (legacy redirect → `/`).
- Info: search, calendar, about, help, privacy, terms.
- Short links: `/e/[shortCode]` (events), `/r/[code]` (referral tracking).
- Calendars (NYU-25): `/calendars/[slug]` — SSR page for a followable curated event stream (washed-theme ground, Follow pill, NyuchiTimeline of its upcoming events, "from \<circle\>" provenance when circle-owned; private calendars 404 to non-owners, unlisted render but are noindexed and excluded from discover/sitemap), plus `/calendars/[slug]/ics` (route handler serving the `text/calendar` feed — public+unlisted only).
- Circles (communities; renamed from "Kraal" — UI/route/i18n only, the DB was already `circles.*`): `/circles`, `/circles/[id]`. Permanent redirects `/kraal*` → `/circles*` live in `next.config.ts`. The circle page leads with an **Events tab** (timeline of the circle's upcoming events); the light posts stream is kept as-is — community features belong to the Circles/Campfire sibling products.
- Signage/kiosk: `/signage`, plus event sub-pages `/events/[id]/kiosk` and `/events/[id]/signage`.
- Agent auth guide: `/auth.md` (`src/app/auth.md/route.ts`) — a static `text/markdown` page describing how AI agents authenticate to the protected write APIs with WorkOS bearer tokens (the `auth.md` discovery convention). Paired with the `.well-known` OAuth/OIDC discovery route handlers (see Route Handlers) for machine-readable agent onboarding.
- SEO: `robots.ts`, `sitemap.ts`; error boundaries `error.tsx`, `global-error.tsx`, `not-found.tsx`, `loading.tsx`.

### UI Components (Mzizi Registry)

shadcn/Radix primitives installed from the Mzizi design-system registry (`mzizi.dev`, shadcn-compatible — `components.json` registers it as `@mzizi` → `https://mzizi.dev/api/v1/ui/{name}`; the `mzizi add` CLI / Mzizi MCP resolver serve the same source), configured in `components.json` (new-york style, RSC, Tailwind v4, Lucide icons). All primitives use `data-slot` attributes, CVA variants, and Radix for accessibility. In `src/components/ui/`: core primitives (button, card, dialog, drawer, tabs, select, form, table, empty, …) plus Mzizi-registry composites (rating, stats-card, filter-bar, status-indicator, timeline, copy-button, file-upload, share-dialog, lazy-section, detail-layout, responsive-modal, share-button, QR code, community-insights, city-dropdown, theme-toggle, verified-badge, …).

#### nyuchi-harness (`src/components/ui/harness.tsx`)

The infrastructure spine the mzizi-branded component library compiles against. It **unifies Nhimbe's existing infra modules** behind one contract rather than re-implementing them — observability (`src/lib/observability.ts`), a11y announcements (`src/components/ui/live-region.tsx`), error resilience (`src/components/error/section-error-boundary.tsx`), and skeleton loading (`src/components/ui/skeleton.tsx`). Motion is token-driven (`--motion-duration-*` / `--motion-ease-*`, with fallbacks) and honours `prefers-reduced-motion`; shared entry keyframes are injected at runtime so `globals.css` stays owned by the design-system PR. Two entry points:

- **`NyuchiHarness`** — declarative section wrapper: `<NyuchiHarness name="feed" loading skeleton={…} fallback={…}>…</NyuchiHarness>` (error boundary + skeleton + render-timing log + entry animation + a11y roles).
- **`useNyuchiHarness(name)`** — imperative hook for leaf brand components, returning `{ log, motion, animStyle, announce }` (trimmed to the fields components actually consume — a `theme`/`locale`/`reportHealth`/`announceUrgent` surface was built but never read, including a per-mount `MutationObserver` behind `theme` across all 27 harness consumers). Also exports the standalone `animStyle()` / `prefersReducedMotion()` helpers.

`verified-badge.tsx` (trust-tier verification badge; tanzanite top tier) is the first brand component wired to it. New brand components should consume the harness rather than touching the underlying modules directly.

#### nyuchi event components (ported from mzizi)

The mzizi events-domain brand components, ported into `src/components/ui/` and each wired through the harness (`useNyuchiHarness`) for observability, reduced-motion entry animation, and a11y:

- **`nyuchi-listing-card.tsx`** (`NyuchiListingCard`) — the foundational universal listing card, variants `row` / `compact` / `hero`, with a mineral category accent. **Replaces `event-card` / `event-card-horizontal` at the home landing teaser, my-events (hosting/past), and calendar agenda.** (`event-card*.tsx` remain only for the signage + map surfaces that still import them.)
- **`nyuchi-rsvp-button.tsx`** (`NyuchiRSVPButton`) — stateful RSVP pill (none/pending/confirmed/waitlisted/declined) with a capacity indicator; wired into the event-detail sidebar (`events/[id]/rsvp-button.tsx`) over the existing `rsvpToEvent` action.
- **`nyuchi-ticket-card.tsx`** (`NyuchiTicketCard`) — digital ticket (QR area, tier, status); rendered on the my-events **Attending** tab.
- **`nyuchi-programme-item.tsx`** (`NyuchiProgrammeItem`) — timeline agenda row; renders the event-detail programme (`events/[id]/event-specifics.tsx`).
- **`nyuchi-calendar.tsx`** (`NyuchiCalendar`) — branded month view with mineral event-dots + an agenda render-prop; powers `/calendar` (the shadcn `calendar` primitive stays for form date-pickers). Cells are `aspect-square` (4.2.0 compact calendar).
- **`nyuchi-meta-tile.tsx`** (`NyuchiMetaTile`) — 4.2.0 date/location signature: rounded-square icon/date chip + bold 16px primary + 13px muted secondary; used for the When / Where rows on event detail.
- **`nyuchi-timeline.tsx`** (`NyuchiTimeline`) — 4.2.0 date-railed discover list (weekday · day · month rail + tight horizontal rows: time · title · host · location · avatar stack · thumbnail). Renders on **scoped surfaces only** (NYU-24): `/events` (incl. `?category=`/`?city=` drill-downs), `/search` (via `NyuchiSearchView`'s `timeline` mode), a circle's Events tab, and the signed-in home's "Your events" — never on the public home or `/discover`.
- **`nyuchi-create-listing.tsx`** — create/edit form shell (`CoverThemePicker`, `FormSection`, `FormRow`, `FormTextArea`, `PublishBar`, `CreateHeader`); the create-event wizard adopts `PublishBar` for its sticky CTA without replacing its state or the `createEvent` action.

Per-event mineral accents come from **`src/lib/category-mineral.ts`** (`categoryToMineral`), keyword-matched with a **tanzanite** default so the brand lead is always the fallback face. `nyuchi-forecast-card` was intentionally **not** ported: Nhimbe's weather is the Mukoko iframe embed (`weather-embed.tsx`, `src/lib/weather.ts`) — a presentational forecast shell has no structured data to bind, so duplicating it was skipped.

#### nyuchi identity / community / trust components (ported from mzizi)

Beyond the event-domain cards, the wider mzizi brand library now lives in `src/components/ui/` (all `nyuchi-*`, each colocated with a `.test.tsx` and wired through the harness). Identity & profile: `nyuchi-profile-header`, `nyuchi-profile-block`, `nyuchi-profile-settings`, `nyuchi-user-card`, `nyuchi-user-menu`, `nyuchi-avatar-stack`, `nyuchi-avatar-picker` (`NyuchiAvatarPicker` — upload/Gravatar/sticker three-way avatar selector, wired into `/profile/edit`; net-new, not yet in the Mzizi registry — proposed upstream as a candidate component, see the feedback log), `nyuchi-onboarding-step`. Community & content: `nyuchi-group-card`, `nyuchi-article-card`, `nyuchi-review-card`, `nyuchi-content-composer`, `nyuchi-search-view` (`NyuchiSearchView`, the `/search` results view), `nyuchi-command-palette` (`NyuchiCommandPalette` — the ⌘K global palette wired into the header: grouped "Go to" nav + live event results, mineral chips, keyboard nav, `/search?q=` fallback), `nyuchi-sidebar-nav`, `nyuchi-notification-item`, `nyuchi-action-sheet`, `nyuchi-alert-banner`, `nyuchi-feedback`, `nyuchi-empty-state`, `nyuchi-success-screen`. Trust & verification: `verified-badge` (the mineral-tier badge), `nyuchi-trust-meter`, `nyuchi-source-badge`, `nyuchi-badge-display`, `nyuchi-leaderboard-row`. Cover & stats: `nyuchi-cover-header`, `nyuchi-cover-wash-header`, `nyuchi-hero-stat`, `nyuchi-stats-row`, `nyuchi-share-card`. Commerce/place: `nyuchi-offer-card`, `nyuchi-place-card`, `nyuchi-registration-card`. Not every component is wired into a live surface yet — the library is adopted incrementally, page by page.

#### Venue verification (Kweli) — `src/lib/kweli.ts`

Nhimbe **never writes or implements** venue verification — **Mukoko Kweli** (`kweli.mukoko.com`) is the ecosystem's single verification surface. `src/lib/kweli.ts` only (a) READS a place's `bundu.verificationTier` (numeric 0–4, defensively coerced; anything unparseable degrades to 0 = unverified) and renders the mineral-tiered `verified-badge` (0 none · 1 community/terracotta · 2 otp/cobalt · 3 government/gold · 4 licensed/tanzanite), and (b) deep-links unverified venues to `KWELI_VERIFY_URL` (`https://kweli.mukoko.com/en/verify`) via the manage-page CTA (`src/app/events/[id]/manage/venue-verify-cta.tsx`).

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
- `security/` — input-validation helpers: `image.ts` (upload MIME/size checks) and `request.ts` (request-shape guards).
- `ics.ts` — RFC 5545 `text/calendar` feed generation for the calendars `/ics` feed and event export (+ tests).
- `kweli.ts` — Mukoko Kweli venue-verification helpers: coerce `bundu.verificationTier` → 0–4 tier level and build the `kweli.mukoko.com/en/verify` deep-link. Read-only; Nhimbe never verifies venues itself (+ tests).
- `auth/` — auth helpers: `dev.ts` (dev bypass), `current-person.ts` (`resolveActingPerson` session→person + lazy sync), `return-to.ts` (`safeReturnTo` open-redirect clamp), `workos-token.ts` (bearer-token verify for the MCP write path), `mcp-actor.ts`.
- `shamwari.ts` — Shamwari assistant helpers.
- `map/tiles.ts` — shared OpenStreetMap base-layer config (Leaflet tiles + attribution), used by the discovery map and the per-event venue map.
- `weather.ts` — Mukoko weather-embed helpers (`slugifyLocation`, `weatherEmbedUrl`) for the `weather.mukoko.com/embed/widget` iframe (+ tests).
- `calendar.ts`, `timezone.ts` — date/time utilities (+ tests).
- `fallback-chain.ts` — resilient data-loading fallback pattern.
- `use-focus-trap.ts`, `use-tracked-link.ts`, `use-save-event.ts` — hooks.
- `themes.ts` — washed per-event theme definitions (mzizi 4.2.0): heritage + experimental palettes + a tanzanite default, each carrying `{ accent, wash, onWash, gradient }` for light + dark. `getTheme()` / `themeIds` / `getThemeColors()`; legacy `mineralThemes` / `mineralThemeIds` aliases retained (+ tests).
- `category-mineral.ts` — `categoryToMineral()` event-category → mineral accent map (tanzanite default) for the branded nyuchi event components (+ tests). Independent of the washed theme options in `themes.ts` — it is a per-card categorisation cue, not a theme picker.
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

**Two suites, deliberately separate.**

**Unit** — Vitest with jsdom + React plugin (`vitest.config.ts`, setup in `src/__tests__/setup.ts`). Tests colocate with modules or live in `src/__tests__/`. Run with `npm run test:run` (~887 tests across ~108 files). Every I/O boundary is mocked, including the Mongo driver. Covered areas include the API client, utils, calendar/timezone/ICS, kweli tier coercion, auth context/guard + `return-to`, SEO metadata, accessibility, the `/api/health` probe, the design-token guard (`src/__tests__/design-tokens.test.ts`), the Mongo layer (mappers, calendars, planner, campfire, entities, stats, settings, event-filters, users, ids), and the `nyuchi-*` brand components (each colocated with a `.test.tsx`).

**Integration** (`vitest.integration.config.ts`, `npm run test:integration`) — `*.integration.test.ts` files run the real Mongo layer against a real in-memory MongoDB (`mongodb-memory-server-core`, booted once in `src/__integration__/global-setup.ts`). This exists because hand-rolled cursor stubs accept *any* query — a malformed aggregation stage, a non-existent operator, a `findOneAndUpdate` whose options changed shape — so the unit suite proves the code *calls* Mongo, never that Mongo would accept what it sent. Kept out of `test:run` (and excluded from its glob, or it fails there with no server) because the first run downloads a ~120MB `mongod` binary; CI runs it as its own cached job.

The Mukoko Events Admin app (`nyuchi/mukoko-events-admin`) carries its own Vitest suite in its own repo.

## Key Files

| File                                              | Purpose                                                        |
| ------------------------------------------------- | -------------------------------------------------------------- |
| `src/app/page.tsx`                                | Home — auth-split RSC (landing / "Your events")                |
| `src/app/discover/page.tsx`                       | Discover browse — categories, circles, cities (SSR)            |
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
| `src/lib/themes.ts`                               | Washed per-event theme options (heritage + experimental, 4.2.0)|
| `src/components/auth/auth-context.tsx`            | Auth state management                                          |
| `src/components/auth/workos-provider.tsx`         | AuthKit provider wrapping the app                              |
| `src/components/error/section-error-boundary.tsx` | Mukoko 3-layer error boundary                                  |
| `CONTRIBUTING.md`, `SECURITY.md`, `RELEASES.md`   | Contribution guidelines, security policy, release notes        |

## Workflow Conventions

> **Agents:** [`AGENTS.md`](./AGENTS.md) is the tool-agnostic subset of these rules for any runner, and reusable task routines live in [`.claude/skills/`](./.claude/skills/) (e.g. `release-check`, `db-seed-verify`, `verify`) — these are **repo dev workflows**.

### Distribution: plugin, marketplace, connectors

The Mukoko Events MCP's distribution surfaces — the Claude Code plugin, the `.claude-plugin/marketplace.json`, the ChatGPT connector, and the consumer Agent Skills (`mukoko-events-discovery`, `mukoko-events-hosting`) — now live in the MCP repo (`nyuchi/mukoko-events-mcp`) alongside the server, so they stay in step with the tool definitions there. Nhimbe no longer carries them. The single MCP endpoint is `events.mukoko.com/mcp` (never `nhimbe.com/mcp`).

- **Big PR, multiple commits** — the Nyuchi house style. Related work lands in one pull request as a sequence of focused, independently readable commits. Don't open a second PR for "just one more cleanup" — append a commit to the active branch.
- **Branches** — work on `claude/<topic>-<slug>` branches; push with `-u origin <branch>` and open the PR as a draft until ready for review.

## Code Conventions

- **Brand**: capitalized "Nhimbe" in user-facing copy and docs (rule reversed 2026-07-19); the admin app is branded "Mukoko Events Admin". Code identifiers, slugs, URLs, package names, DB values, storage keys and env vars stay lowercase.
- **TypeScript strict mode**.
- **Server-side data only** — MongoDB access is guarded by `import "server-only"`; never touch the driver from client components.
- **Tailwind CSS v4** with the `cn()` helper from `src/lib/utils.ts`.
- **React Context** for global state (AuthProvider, ThemeProvider) — no Redux/Zustand.
- **`"use client"`** directive required for interactive components.
- **WCAG AAA** — 7:1+ contrast for primary/secondary text, 44px touch targets.
- **Dark/light modes** via `.dark`/`.light` classes, design tokens in `globals.css`.
- **Design tokens follow the mzizi doctrine 4.1.0** (`src/app/globals.css`, guarded by `src/__tests__/design-tokens.test.ts`), applied **additively** with deliberate Nhimbe divergences:
  - **Pill inputs (the 4.1.0 headline):** `--radius-button` and `--radius-input` are `9999px` — Button, Input and the Select trigger render as **pills** (`rounded-full`); Textarea uses `rounded-2xl` (17px) to avoid a growing-stadium artifact. Per-component radii: card 14px (`--radius-lg`), dialog/tabs 17px (`--radius-xl`), checkbox 7px (`--radius-sm`). `--radius-base` (14) / `--radius-2xl` (17) are doctrine aliases.
  - **tanzanite stays the brand `--primary`** in every theme (cobalt is the "exceptional" mineral for links/info only — `--nh-secondary`/`--info`). Do **not** switch `--primary` to cobalt.
  - **Compact touch-target scale is intentional** (`--touch-target-lg: 48px` / `40px` / `34px`); blanket min-heights are deliberately **not** enforced (see the comment in `globals.css`). Control heights are token-driven (`--h-button-default`/`--h-button-sm`/`--h-input`, currently 36/32/36) — the single knob to adopt the doctrine's 56/48 later without touching components.
  - Extended spacing ladder (`*-plus` half-steps, `--space-4xl/5xl/6xl`), type tokens (`--fs-display-sm/h6/code`), the `--font-mono` (JetBrains Mono, loaded via `next/font` in `layout.tsx`), shadow rungs (`--shadow-none/xs/inner/focus-ring`), and motion aliases (`--motion-duration-*`, `--motion-ease-spring`, `--motion-stagger-*`) are all present.
  - **4.2.0 washed refresh (density + cover-wash + timeline):** the `Card` primitive is compact (14px padding `py-3.5 px-3.5`, 10px `gap-2.5`, full 1px border); brand-card metadata is 13px `text-muted-foreground`. Per-event **theme options** are the mzizi **heritage + experimental** washed palettes (`src/lib/themes.ts`), tanzanite default. `EventThemeWrapper` emits each theme's light+dark values as inline `--ev-*` vars; `globals.css` selects the active mode and computes **`--wash`** (active surface + event accent, ~7% light / ~12% dark) which paints the event-detail ground. The idle RSVP CTA derives its fill from `--event-primary`. Signature patterns: **`nyuchi-meta-tile`** (date/location chip) on event detail, and **`nyuchi-timeline`** (date-rail list) on scoped surfaces — `/events` drill-downs, `/search`, circle Events tabs, and the signed-in home. Compact `nyuchi-calendar` cells are `aspect-square`. **tanzanite remains the app `--primary`** — the per-theme wash only tints event surfaces (guarded by `design-tokens.test.ts`).
- **Schema.org alignment** — events and users modeled after schema.org specs.
- **Structured logging** — `[mukoko]` prefix on all log output.
- **Path alias** — `@/*` maps to `./src/*`.

## Environment Variables

Set in Vercel (prod + preview) and locally in `.env.local`:

- `MONGODB_URI` — MongoDB connection string (required; prod + preview).
- `WORKOS_CLIENT_ID` — WorkOS Client ID (server-only; no `NEXT_PUBLIC_` prefix).
- `WORKOS_API_KEY` — server-only, used by the AuthKit proxy.
- `WORKOS_COOKIE_PASSWORD` — server-only session-cookie encryption key (≥32 chars).
- `WORKOS_API_HOSTNAME` *(optional)* — defaults to `api.workos.com`; set to `auth.mukoko.com` (the custom **API** domain) to route WorkOS API calls — and the bearer-token verifier's JWKS fetch (`/sso/jwks/{clientId}`) — through it. This is the API surface, **not** the authorization-server or hosted-UI domain. (Was `api.identity.nyuchi.com` before the Aug 2026 migration.)
- `WORKOS_AUTHKIT_DOMAIN` *(optional)* — the hosted **AuthKit** domain (`accounts.mukoko.com` in production; the code default), which is the OAuth 2.1 **authorization server** MCP clients discover and authenticate against (`/oauth2/{authorize,token,register,jwks}`, DCR enabled). Everything the `.well-known/*` discovery routes and `/auth.md` advertise is built from this via `src/lib/auth/workos-metadata.ts`. Accepts `WORKOS_ISSUER` as the preferred spelling. Override per environment (e.g. `accounts-staging.mukoko.com`, or a WorkOS-hosted `*.authkit.app` domain). (Was `identity.nyuchi.com` before the Aug 2026 migration.)

> **The four hosts, and why they are not interchangeable.** Three `*.mukoko.com` subdomains plus one `nyuchi.com` do four different jobs, and mixing them up fails a long way from the cause:
>
> | Host | What it is |
> | --- | --- |
> | `accounts.mukoko.com` | WorkOS **AuthKit issuer** — the OAuth 2.1 authorization server agents discover. Serves its own self-consistent metadata + DCR. `WORKOS_AUTHKIT_DOMAIN` / `WORKOS_ISSUER`. |
> | `auth.mukoko.com` | WorkOS **auth API** — what the SDK calls and where the JWKS fetch goes. `WORKOS_API_HOSTNAME`. |
> | `api.nyuchi.com` | The **Nyuchi API gateway** (FastAPI on Fly, repo `nyuchi/api-gateway`) — the gateway serving traffic today. Nothing to do with WorkOS. |
> | `api.mukoko.com` | A **separate Mukoko API gateway still being built** — serves nothing usable yet. Also not WorkOS, despite sitting between the two that are. |
>
> Advertising the auth API where the issuer belongs produces metadata that validates but dead-ends: a client following the pointer finds no authorization-server document and the flow dies at discovery, before sign-in.
- `NEXT_PUBLIC_WORKOS_REDIRECT_URI` — usually `${NEXT_PUBLIC_SITE_URL}/callback`. The `NEXT_PUBLIC_` prefix is **required** — AuthKit reads it from the client bundle to form the OAuth start URL.
- `WORKOS_WEBHOOK_SECRET` — server-only signing secret for the WorkOS event webhook (`POST /api/webhooks/workos`, guaranteed user provisioning). Create the webhook endpoint `https://nhimbe.com/api/webhooks/workos` in the WorkOS dashboard (user + organization_membership events) and copy its signing secret here. When unset the endpoint answers 503 and provisioning falls back to the callback + lazy sync.
- `SHAMWARI_AI_GATEWAY_URL`, `SHAMWARI_AI_GATEWAY_TOKEN` — Cloudflare AI Gateway base + provider bearer; optional `SHAMWARI_AI_GATEWAY_AUTH_TOKEN` for the authenticated gateway.
- `RESEND_API_KEY` — server-only; used for transactional email via Resend (`src/lib/email/`). Sends from the verified `notify.mukoko.com` domain (`events@notify.mukoko.com`). When unset, email sends are skipped (never throw).
- `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` — server-only R2 S3 API credentials for cover-image uploads (`src/lib/r2.ts`). `R2_BUCKET` *(optional)* defaults to `mukoko-storage`. When unset, `/api/media/upload` returns 503 and uploads fall back to a gradient cover.
- `FUNDI_API_TOKEN` — server-only bearer token for the `fundi-ingestion` Cloudflare Worker's `POST /tasks` endpoint. `src/app/actions/geocode.ts` fires a best-effort `search_miss` task whenever a places-catalogue search falls through to OSM Nominatim, so fundi-ingestion bulk-seeds the surrounding area (Overpass + Plus Codes/what3words/Wikidata/AI-description enrichment) into the shared `places.places`/`entity.entities` collections for next time. When unset, reporting is skipped silently — nhimbe's own address search is unaffected either way. `FUNDI_INGESTION_URL` *(optional)* defaults to `https://fundi-ingestion.nyuchi.dev`.
- `NEXT_PUBLIC_SITE_URL` — the **primary/canonical** public origin (default `https://events.mukoko.com`). See "Dual-domain" below — this is the single origin all self-referential URLs (canonical tags, OG images, sitemap, robots, JSON-LD, `.well-known` resource) point at, resolved once in `src/lib/site-url.ts` (`SITE_URL`).
- `NEXT_PUBLIC_ASSETS_URL` *(optional)* — override the R2 assets host (defaults to `https://assets-s001.mukoko.com`).
- `ADMIN_URL` *(optional)* — where `/admin*` redirects (defaults to `https://admin.events.mukoko.com`). The admin app itself is a separate repo (`nyuchi/mukoko-events-admin`) and Vercel project with its own env.
- `WORKOS_ADMIN_ORG_ID` *(admin app only; optional)* — the nyuchi WorkOS **organization id** (`org_…`) used only to org-scope the hosted sign-in screen (a UX hint, not the gate). Set on the **nhimbe-admin** Vercel project, not the public app.
- `NYUCHI_ADMIN_ENTITY_ID` *(admin app only; optional)* — the Nyuchi **entity id** (`entity.entities._id`) whose active staff memberships (`entity.memberships`) may enter the admin app; when unset the entity is resolved by the `nyuchi-africa` slug and cached per process. See the `nyuchi/mukoko-events-admin` repo README.

Maps, address search and weather need **no API keys**: maps render **Leaflet + OpenStreetMap** tiles client-side (`src/lib/map/tiles.ts`), address geocoding is **DB-first (`places.places`) then OSM Nominatim** server-side (`src/app/actions/geocode.ts`), and weather is the shared **Mukoko embed** (`weather.mukoko.com/embed/widget`, `src/lib/weather.ts`) — replacing the former Google Maps + wttr.in stack. `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` has been removed; delete it from Vercel.

**Intentionally unset**: `NEXT_PUBLIC_API_URL` — the API is same-origin. There are **no** Supabase/Postgres environment variables.
