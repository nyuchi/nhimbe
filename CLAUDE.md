# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**nhimbe** (pronounced /ˈnhimbɛ/) — community events discovery and management platform, part of the Mukoko ecosystem. Full-stack monorepo: Next.js 16 frontend (Vercel) + Cloudflare Workers backend (Hono, Vectorize, Workers AI, R2, KV) backed by Supabase Postgres (via PostgREST) and the api.mukoko.com FastAPI gateway. Auth is WorkOS AuthKit end-to-end.

## Build & Dev Commands

```bash
# Frontend (root directory)
npm install && npm run dev          # Dev server at http://localhost:3000
npm run build                       # Production build (Next.js)
npm run lint                        # ESLint

# Backend (worker/ directory)
cd worker && npm install && npm run dev   # Dev server at http://localhost:8787
cd worker && npm run deploy               # Deploy to Cloudflare
cd worker && npx tsc --noEmit             # Type check worker (production code only)

# Tests (Vitest for both)
npx vitest run                      # Frontend tests (from root)
npx vitest run src/lib/api.test.ts  # Single frontend test file
cd worker && npx vitest run         # Backend tests
cd worker && npx vitest run src/__tests__/auth.test.ts  # Single backend test file

# Database migrations
# Owned by the nyuchi_platform_db Supabase project, not nhimbe — apply via
# the Supabase MCP (`apply_migration`) or `supabase db push` from that repo.
# This repo only reads/writes via PostgREST in `worker/src/db/supabase.ts`.
```

## CI Pipeline

GitHub Actions (`.github/workflows/ci.yml`) runs 4 parallel jobs on every push to any branch:

1. **Lint & Build** — `npm run lint` + `npm run build` (placeholder env vars)
2. **Frontend Tests** — `npm run test:run`
3. **Worker Tests** — `cd worker && npx vitest run`
4. **Worker Type Check** — `cd worker && npx tsc --noEmit`

All 4 must pass. The build uses placeholder env vars so `NEXT_PUBLIC_*` values don't need real secrets. (The migration-validation job was retired when D1 migrations moved out of this repo to nyuchi_platform_db.)

## Architecture

### Frontend → Backend Communication

All frontend API calls go through `src/lib/api.ts` (centralized client) → Cloudflare Worker at `NEXT_PUBLIC_API_URL`. Write operations pass session JWT as `Authorization: Bearer` header.

### Backend Routing (Hono)

`worker/src/index.ts` (~186 lines) is the entry point using the **Hono** framework with modular route mounting:

```ts
app.route("/api/events", events);
app.route("/api/users", users);
app.route("/api/payments", payments);
```

Global middleware applied in `index.ts`: CORS (restricted to trusted origins), environment validation (logs missing bindings on first request), security headers (HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy), observability (request IDs + structured logging), rate limiting (all API endpoints), error handling (generic messages — no error details leaked), 404 handler, and queue consumer.

**18 route modules** in `worker/src/routes/`:

| Route Module       | Endpoints                                                                                                                 |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| `events.ts`        | Event CRUD, list, filtering, cancel, CSV export                                                                           |
| `admin.ts`         | Admin dashboard, user suspend/activate, growth metrics                                                                    |
| `health.ts`        | Health checks, system probes for Supabase/Vectorize/R2/KV                                                                 |
| `users.ts`         | User sync (WorkOS → identity.person), profile management, onboarding, account deletion (soft delete via `role='deleted'`) |
| `links.ts`         | Short-link resolver (`/api/links/:shortCode` → event/series target)                                                       |
| `registrations.ts` | Event registrations (atomic capacity checks, race condition prevention)                                                   |
| `stats.ts`         | Community stats, peak time calculation, event analytics                                                                   |
| `media.ts`         | Image upload to R2 (10MB limit)                                                                                           |
| `search.ts`        | RAG search via Vectorize                                                                                                  |
| `categories.ts`    | Category listing (DB-only), cities (derived from published events)                                                        |
| `ai.ts`            | AI routes (assistant, description generator) with prompt injection detection                                              |
| `referrals.ts`     | Referral tracking (writeAuth protected)                                                                                   |
| `reviews.ts`       | Event reviews (writeAuth protected)                                                                                       |
| `series.ts`        | Recurring event series CRUD (RRULE support)                                                                               |
| `waitlist.ts`      | Waitlist join/leave/list (auth-protected)                                                                                 |
| `checkin.ts`       | QR-based check-in and attendance stats                                                                                    |
| `kiosk.ts`         | TV-style kiosk pairing (6-char codes), session management for on-site check-in and digital signage                        |
| `payments.ts`      | Payment intents, Paynow webhooks (HMAC-SHA512 verified), status checks                                                    |

### Middleware (`worker/src/middleware/`)

- `auth.ts` — JWT extraction, validation, timing-safe API key comparison
- `observability.ts` — Request ID generation and structured logging
- `rate-limit.ts` — Rate limiting for all API endpoints (100 req/min)
- `ai-safety.ts` — Prompt injection detection, input sanitization, max length enforcement
- `index.ts` — Barrel export for auth middleware (`writeAuth`, `apiKeyRequired`, `getAdminUser`, `isAllowedOrigin`, `validateApiKey`)

### Utils (`worker/src/utils/`)

- `ids.ts` — ID generation (short codes, slugs)
- `response.ts` — Consistent JSON response formatting
- `validation.ts` — Input validation schemas
- `timeout.ts` — Request timeout handling
- `circuit-breaker.ts` — Netflix Hystrix-inspired circuit breaker (CLOSED→OPEN→HALF_OPEN). Currently only wired into `ai/search.ts` (Vectorize + Workers AI); Supabase calls are uncovered.
- `retry.ts` — Exponential backoff with jitter. Wired into `supabaseFetch()` for the GET path only (writes are not retried to avoid duplicate POST/PATCH/DELETE side effects). Retries 502/503/504 and network failures up to 2 attempts.
- `observability.ts` — Backend structured logging with `[mukoko]` prefix
- `audit.ts` — Audit logging to the `audit_logs` table on Supabase
- `export.ts` — CSV export with proper escaping
- `index.ts` — Barrel export for common utilities

### Database adapter (`worker/src/db/`)

- `supabase.ts` — Thin `supabaseFetch()` helper that wraps PostgREST calls with the service-role key, request ID propagation, and consistent error handling. All route modules use this instead of a raw fetch.
- `event_mapper.ts` — Maps Postgres row shapes (snake_case) to the schema.org-aligned API shapes (`Event`, etc.) consumed by the frontend.

### Queues (`worker/src/queues/`)

- `handlers.ts` — Queue message processors for analytics and email background jobs (consumed in `index.ts`)

### Email (`worker/src/email/`)

- `resend.ts` — Fetch-based Resend API client (no SDK, Workers-compatible)
- `templates.ts` — 5 email templates: registration confirmed, event reminder, event cancelled, host new registration, registration cancelled
- `triggers.ts` — Queue message producers for each email type

### Payments (`worker/src/payments/`)

- `types.ts` — PaymentProvider interface abstraction
- `paynow.ts` — Paynow provider for Zimbabwean mobile money (EcoCash, OneMoney, Telecash) with HMAC-SHA512 webhook signature validation (timing-safe comparison)

### Authentication Flow

1. Frontend uses **WorkOS AuthKit** (`@workos-inc/authkit-nextjs`). Session cookies are managed by the AuthKit proxy at `proxy.ts` (Next.js 16+ proxy, was middleware in <=15). The provider component lives at `src/components/auth/workos-provider.tsx`.
2. After sign-in, AuthKit returns the user to `/callback`, which exchanges the auth code for a session. `AuthProvider` (`src/components/auth/auth-context.tsx`) then calls the worker's `/api/users/me/sync` endpoint with the WorkOS access token.
3. Backend validates the access token locally using WorkOS's public JWKS at `https://api.workos.com/sso/jwks/{WORKOS_CLIENT_ID}` (`worker/src/auth/workos.ts`). The issuer must be `https://api.workos.com` and the audience must contain `WORKOS_CLIENT_ID`. No WorkOS API secret is needed for the per-request path; the JWKS is cached for 1 hour.
4. `getAuthenticatedUser()` returns `AuthResult` with structured `failureReason` (e.g., `token_expired`, `issuer_mismatch`, `audience_mismatch`, `jwks_fetch_failed`, `invalid_signature`).
5. If user-sync fails, the user stays logged out (no fallback user creation).
6. **Suspended user enforcement**: user-sync checks `identity.person.role` — suspended/deleted users get 403 with `reason: "account_suspended"`.

`src/app/authenticate/page.tsx` is a compatibility redirect for old magic-link emails that pointed at the Stytch flow — it now sends users to `/`. The canonical post-auth landing is `/callback`.

### Write Operation Authorization

Protected endpoints use either:

- **JWT auth** via `getAuthenticatedUser()` for user-specific operations (onboarding, profile)
- **writeAuth middleware** — Origin check via `isAllowedOrigin()` OR API key via `X-API-Key` header (timing-safe comparison)

Trusted domains are hardcoded in the worker: `nyuchi.com`, `mukoko.com`, `nhimbe.com` and all subdomains are always allowed.

### AI Features (`worker/src/ai/`)

- **RAG Search** (`search.ts`): BGE-base-en-v1.5 embeddings → Cloudflare Vectorize → Llama 3.1 8B summaries
- **AI Assistant** (`assistant.ts`): "Shamwari" chat interface
- **Description Wizard** (`description-generator.ts`): Qwen 3 30B generation
- **Embeddings** (`embeddings.ts`): Shared embedding utilities
- **AI Safety** (`middleware/ai-safety.ts`): Prompt injection detection on all AI routes

### Resilience Patterns (Mukoko Registry — Nyuchi architecture L5 / L8)

- **Circuit Breaker** (`worker/src/utils/circuit-breaker.ts`) — Per-provider configs for vectorize, ai, r2. **Note**: Supabase REST calls are not yet wrapped.
- **Retry with Backoff** (`worker/src/utils/retry.ts`) — Exponential backoff with jitter. Wraps `supabaseFetch()` GET calls; retries `SupabaseTransientError` (502/503/504 + network failures) up to 2 attempts. Writes deliberately skip retry to avoid duplicate side effects.
- **Structured Logging** — `[mukoko]` prefix on all log output (frontend: `src/lib/observability.ts`, backend: `worker/src/utils/observability.ts`)
- **Section Error Boundary** (`src/components/error/section-error-boundary.tsx`) — 3-layer error boundary with retry

## Frontend Structure

### Pages (`src/app/`)

- Home, events (create/detail/manage), my-events, profile, admin (events/users/settings/signage/support)
- Auth: `/auth/signin`, `/auth/error`, `/callback` (WorkOS post-auth landing), `/authenticate` (legacy Stytch redirect → `/`)
- Info: search, calendar, about, help, privacy, terms
- Short links: `/e/[shortCode]` (events), `/r/[code]` (referral tracking)
- Kraal (community circles linked to events): `/kraal`, `/kraal/[id]`
- Signage: `/signage` (TV/kiosk display mode)
- Event sub-pages: `/events/[id]/kiosk` (on-site check-in), `/events/[id]/signage` (digital signage display)
- SEO: `robots.ts`, `sitemap.ts` for search engine optimization

### UI Component Architecture (Mukoko Registry)

**34 shadcn/Radix primitives** installed from the Mukoko registry (`registry.mukoko.com`). All components use `data-slot` attributes, CVA variants, and Radix primitives for accessibility.

**Core primitives** (`src/components/ui/`): button, card, badge, input, dialog, drawer, tabs, select, dropdown-menu, separator, sheet, label, textarea, switch, toggle, scroll-area, skeleton, avatar, popover, tooltip, form, checkbox, radio-group, progress, calendar, sonner, spinner, collapsible, hover-card, navigation-menu, breadcrumb, pagination, table, toggle-group

**Mukoko-exclusive components** (`src/components/ui/`): rating (interactive star rating with mineral gold accent), stats-card (metric display with trend indicators), filter-bar (horizontal chip filter with single/multi mode), status-indicator (status dot with pulse animation), timeline (composable vertical timeline with mineral dot colors), copy-button (clipboard with copied state), file-upload (drag-and-drop with validation), share-dialog (WhatsApp/X/Email sharing modal), lazy-section (TikTok-style FIFO mount queue with IntersectionObserver), detail-layout (shared detail page layout with hero/sidebar/back nav)

**Composite components**: responsive-modal (Drawer on mobile / Dialog on desktop), share-button, invite-friends, event-ratings, host-reputation, referral-leaderboard, AI description wizard, address-autocomplete, QR code, popularity-badge, community-insights, city-dropdown, animated-background, gradient-background, live-region (ARIA live announcements), theme-toggle

**Total**: 63 component files in `src/components/ui/` (including barrel `index.ts`)

**Config**: `components.json` at root — shadcn new-york style, RSC, Tailwind v4, Lucide icons

### Components (`src/components/`)

- `ui/` — 34 shadcn primitives + domain-specific composites (ratings, reputation, referrals, AI wizard)
- `auth/` — `auth-context.tsx`, `workos-provider.tsx`, `auth-guard.tsx` + tests
- `modals/` — ResponsiveModal-based sheets for category, date, location, capacity, description, ticketing
- `prompts/` — Onboarding: name, location, interests
- `layout/` — Header, footer
- `error/` — `section-error-boundary.tsx` (Mukoko 3-layer pattern)
- `pwa/` — Service worker registration
- `theme-provider.tsx` (top-level) — Dark/light mode context provider

### Event Form Decomposition (`src/app/events/create/`)

- `create-event-form.tsx` — Main form (~377 lines)
- `cover-image-upload.tsx` — Cover image upload with preview
- `theme-selector.tsx` — Mineral theme picker with carousel
- `event-options-card.tsx` — Ticketing, approval, capacity settings
- `form-field-row.tsx` — Reusable field row component

### Event Detail Decomposition (`src/app/events/[id]/`)

- `event-detail-content.tsx` — Main layout (~208 lines)
- `event-cover.tsx` — Cover image with badges, stats overlay
- `event-sidebar.tsx` — Ticket card, insights, QR code, friends, host reputation
- `event-actions.tsx` — Event action buttons
- `event-map.tsx` — Map integration
- `event-qr-code.tsx` — QR code display
- `event-theme-wrapper.tsx` — Theme-aware wrapper
- `event-weather.tsx` — Weather display for event location
- `rsvp-button.tsx` — RSVP/registration button
- `kiosk/` — On-site kiosk check-in sub-page (host pairing flow)
- `signage/` — Digital signage display sub-page
- `manage/` — Event management page

### Frontend Libraries (`src/lib/`)

- `api.ts` — Centralized worker REST client (calls `NEXT_PUBLIC_API_URL` with the WorkOS access token as a Bearer header for writes)
- `supabase/` — Direct Supabase access for read paths the worker doesn't proxy. `client.ts` (browser anon-key client), `server.ts` (RSC client), `api.ts` (typed read helpers — Kraal, person, etc.), `types.ts` (generated row types).
- `calendar.ts` — Calendar/date utilities (with `calendar.test.ts`)
- `timezone.ts` — Timezone handling utilities (with `timezone.test.ts`)
- `fallback-chain.ts` — Fallback chain pattern for resilient data loading
- `use-focus-trap.ts` — Focus trap hook for modal accessibility
- `use-tracked-link.ts` — Hook to wrap `<a>` with analytics-event tracking
- `themes.ts` — Mineral theme definitions
- `observability.ts` — Frontend structured logging (`[mukoko]` prefix)
- `utils.ts` — Shared utilities including `cn()` class merger (with `utils.test.ts`)

### Hooks (`src/hooks/`)

- `use-mobile.ts` — Viewport-based mobile detection
- `use-toast.ts` — Toast notification dispatcher (wraps sonner)
- `use-memory-pressure.ts` — Hint memory pressure to drop heavy renders (Lazy-section, etc.)

### i18n (`src/lib/i18n/`)

Lightweight custom i18n with `t()`, `setLocale()`, `getLocale()`. Languages: English (default) + Shona.

### PWA

Service worker at `public/sw.js` — cache-first for static assets, network-first for API calls. Registered in production via `src/components/pwa/sw-register.tsx`.

### State Management

- **React Context** only — `AuthProvider` (JWT + user state), `ThemeProvider` (dark/light mode)
- No Redux/Zustand

## Testing

### Frontend Tests (8 files, 160 tests)

Tests colocate with modules (e.g., `src/lib/api.test.ts`) or live in `src/__tests__/`. Config: `vitest.config.ts` with jsdom and React plugin. Test setup: `src/__tests__/setup.ts`.

- `src/lib/api.test.ts` — API client tests
- `src/lib/utils.test.ts` — Utility function tests
- `src/lib/calendar.test.ts` — Calendar utility tests (32 tests)
- `src/lib/timezone.test.ts` — Timezone handling tests
- `src/components/auth/auth-context.test.tsx` — Auth context tests (9 tests)
- `src/components/auth/auth-guard.test.tsx` — Auth guard tests (4 tests)
- `src/__tests__/seo.test.ts` — SEO metadata tests (25 tests)
- `src/__tests__/accessibility.test.ts` — Accessibility compliance tests (18 tests)

### Backend Tests (5 files, 124 tests)

All backend tests live in `worker/src/__tests__/`. Config: `worker/vitest.config.ts` with `globals: true`.

- `auth.test.ts` — Bearer extraction, WorkOS JWT structure validation, JWKS cache logic, issuer/audience checks
- `mukoko-api.test.ts` — `mukokoApiFetch` client: machine API-key forwarding, optional user-token forwarding, error propagation
- `validation.test.ts` — Input validation, security checks
- `security.test.ts` — Authorization, origin checks, API key validation
- `observability.test.ts` — Logging, request IDs, cache-key namespacing

**Mock architecture** (`worker/src/__tests__/mocks.ts`) — 3 layers:

- **L1: Primitives** — `createMockKV()`, `createMockR2()`, `createMockVectorize()`, `createMockAI()` (D1 mock retired with the migration)
- **L2: Env Factory** — `createMockEnv()` combines all bindings
- **L3: Request Builders** — `createRequest()`, `createAuthenticatedRequest()`, `createApiKeyRequest()`

**Coverage debt**: PR #34 deleted `events.test.ts`, `registrations.test.ts`, `users.test.ts`, `auth-profile.test.ts`, `routes-coverage.test.ts`, `ai-layers.test.ts` because they mocked D1 internals. Rebuilding them against `supabaseFetch` (by stubbing global `fetch`) is the highest-priority post-migration testing task — priority order: registrations → users → events → payments → kiosk.

**Note:** Worker test files (`__tests__/**`, `*.test.ts`, `*.spec.ts`) are excluded from `worker/tsconfig.json` so `tsc --noEmit` only checks production code.

## Database

**Primary: Supabase Postgres** (project `nyuchi_platform_db`, hosted at `https://tdcpuzqyoodrdsxldgsh.supabase.co`). All read/write is via PostgREST through `worker/src/db/supabase.ts` (`supabaseFetch()` helper, service-role key). The frontend can also read directly via `src/lib/supabase/` clients using the anon key (RLS-protected paths only).

The schema is owned by the `nyuchi_platform_db` repo — not this one. Apply migrations via the Supabase MCP (`apply_migration`) or `supabase db push` from that repo. This repo only consumes the schema.

### Schemas used by nhimbe

- **identity** — `person` (WorkOS user mirror; primary key includes `workos_user_id`), roles, suspended-user flags
- **events** — `event`, `event_series`, `category`, `event_view`, `event_circle` (Kraal linkage)
- **engagement** — `registration`, `review`, `referral`, `waitlist`, `kiosk_pairing`
- **payments** — `payment`, Paynow transaction state
- **audit** — `audit_logs` for destructive operations
- **search** — `search_query` (analytics), AI conversation logs

### Counter-column hot spots

Three counters are read-then-written through PostgREST and are race-prone under concurrency. When traffic warrants it, migrate each to a Postgres function called via `/rest/v1/rpc/`:

- `events.event.attendee_count` (in `routes/registrations.ts`)
- `events.event.view_count` (in `queues/handlers.ts`)
- `engagement.review.helpful_count` (in `routes/reviews.ts`)

## Key Files

| File                                              | Purpose                                                             |
| ------------------------------------------------- | ------------------------------------------------------------------- |
| `worker/src/index.ts`                             | Hono app entry, routing, middleware setup, env validator            |
| `worker/src/types.ts`                             | Backend type definitions (Cloudflare bindings, Env, queue messages) |
| `worker/src/auth/workos.ts`                       | WorkOS JWT validation with JWKS caching, `AuthResult` type          |
| `worker/src/middleware/auth.ts`                   | Auth middleware, timing-safe API key validation                     |
| `worker/src/middleware/ai-safety.ts`              | Prompt injection detection                                          |
| `worker/src/utils/circuit-breaker.ts`             | Circuit breaker for external services                               |
| `worker/src/email/`                               | Resend email client, templates, triggers                            |
| `worker/src/payments/`                            | Payment provider abstraction (Paynow) + Mukoko API gateway client   |
| `worker/src/db/supabase.ts`                       | PostgREST helper (`supabaseFetch()`) used by every route            |
| `worker/src/db/event_mapper.ts`                   | Postgres row → API shape (schema.org) mapper                        |
| `src/lib/api.ts`                                  | Worker REST client (events, registrations, etc.)                    |
| `src/lib/supabase/api.ts`                         | Direct Supabase reads (Kraal, person profile lookups)               |
| `src/lib/observability.ts`                        | Frontend structured logging (`[mukoko]` prefix)                     |
| `src/lib/i18n/index.ts`                           | i18n translations (English + Shona)                                 |
| `src/lib/themes.ts`                               | Mineral theme definitions                                           |
| `src/components/auth/auth-context.tsx`            | Auth state management, WorkOS sync via `/api/users/me/sync`         |
| `src/components/auth/workos-provider.tsx`         | AuthKit provider wrapping the app                                   |
| `src/components/error/section-error-boundary.tsx` | Mukoko 3-layer error boundary                                       |
| `src/components/ui/share-button.tsx`              | WhatsApp-first social sharing                                       |
| `proxy.ts`                                        | Next.js 16 AuthKit proxy (session cookie management)                |
| `worker/src/routes/kiosk.ts`                      | Kiosk pairing, session management                                   |
| `worker/src/queues/handlers.ts`                   | Queue message processors (analytics, email)                         |
| `worker/wrangler.toml`                            | Cloudflare bindings and env config                                  |
| `src/lib/calendar.ts`                             | Calendar/date utilities                                             |
| `src/lib/timezone.ts`                             | Timezone handling                                                   |
| `src/lib/fallback-chain.ts`                       | Fallback chain pattern for resilient loading                        |
| `CONTRIBUTING.md`                                 | Contribution guidelines                                             |
| `SECURITY.md`                                     | Security policy and reporting                                       |
| `RELEASES.md`                                     | Release notes                                                       |

## Workflow Conventions

- **Big PR, multiple commits** — the Nyuchi house style. Related work lands in one pull request as a sequence of focused commits, not as separate PRs. Each commit is independently readable; the PR groups them by intent. Don't open a second PR for "just one more cleanup" — append a commit to the active branch.
- **Branches** — work on `claude/<topic>-<slug>` branches; push with `-u origin <branch>` and open the PR as a draft until ready for review.

## Code Conventions

- **Brand**: Always lowercase "nhimbe" — even at sentence start
- **TypeScript strict mode** in both frontend and backend
- **Tailwind CSS v4** with `cn()` helper from `src/lib/utils.ts` for conditional classes
- **React Context** for global state (AuthProvider, ThemeProvider) — no Redux/Zustand
- **`"use client"`** directive required for interactive components
- **WCAG AAA** compliance — 7:1+ contrast ratios for primary/secondary text, 44px touch targets
- **Dark/light modes** via `.dark` and `.light` CSS classes, design tokens in `globals.css`
- **Schema.org alignment** — Events and users modeled after schema.org specs
- **Structured logging** — `[mukoko]` prefix on all log output, structured JSON in backend
- **Request ID tracking** — Every backend request gets a unique ID for observability
- **Audit logging** — All destructive operations logged to `audit_logs` table
- **Path alias** — `@/*` maps to `./src/*` in frontend

## Environment Variables

Frontend (`.env.local`):

- `NEXT_PUBLIC_WORKOS_CLIENT_ID` — WorkOS Client ID (public)
- `WORKOS_API_KEY` — server-only, used by the AuthKit proxy
- `WORKOS_COOKIE_PASSWORD` — server-only, session-cookie encryption key (≥32 chars)
- `WORKOS_REDIRECT_URI` — usually `${NEXT_PUBLIC_SITE_URL}/callback`
- `NEXT_PUBLIC_API_URL` — worker base URL (e.g. `http://localhost:8787`)
- `NEXT_PUBLIC_SITE_URL` — public site URL
- `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` — for direct browser/RSC reads via `src/lib/supabase/`

Backend (`worker/.dev.vars`):

- `API_KEY` — internal machine-context key for `writeAuth` middleware
- `WORKOS_CLIENT_ID` — overrides the wrangler.toml placeholder for local dev
- `SUPABASE_SERVICE_ROLE_KEY` — bearer for `supabaseFetch()`
- `MUKOKO_API_KEY` — bearer for `mukokoApiFetch()` (api.mukoko.com gateway)
- `RESEND_API_KEY` — Resend transactional email

Backend (`worker/wrangler.toml` vars): `ENVIRONMENT`, `ALLOWED_ORIGINS`, `WORKOS_CLIENT_ID` (dev only — production/staging must set via `wrangler secret put`), `SUPABASE_URL`, `MUKOKO_API_URL`

Backend secrets (set via `wrangler secret put --env <env>`): `API_KEY`, `WORKOS_CLIENT_ID` (production/staging), `SUPABASE_SERVICE_ROLE_KEY`, `MUKOKO_API_KEY`, `RESEND_API_KEY`, `PAYNOW_INTEGRATION_ID`, `PAYNOW_INTEGRATION_KEY`

Cloudflare bindings: `AI` (Workers AI), `VECTORIZE`, `CACHE` (KV), `MEDIA` (R2), `IMAGES`, `ANALYTICS`, `ANALYTICS_QUEUE`, `EMAIL_QUEUE`, `RATE_LIMITER` (no D1 binding post-migration)
