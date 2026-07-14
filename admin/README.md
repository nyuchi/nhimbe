# nhimbe-admin

The standalone administration dashboard for **nhimbe** — a Next.js 16 app that
deploys as its **own Vercel project** from this repo's `admin/` directory. The
public app no longer ships an `/admin` surface; it redirects here.

## Architecture: share, don't duplicate

This app owns **no data layer and no design system**. Everything server- and
design-side is imported from the repo root:

| Imported from root                           | Used for                                    |
| -------------------------------------------- | ------------------------------------------- |
| `src/lib/mongo/*` (`admin.ts`, `users.ts`, `settings.ts`, `databases.ts`, …) | All MongoDB reads/writes (`server-only` intact) |
| `src/lib/mongo/admin-types.ts`               | Client-safe row/tile types                  |
| `src/components/ui/*` (+ harness)            | nyuchi/Mukoko components (NyuchiSidebarNav, NyuchiHeroStat, NyuchiStatsRow, primitives) |
| `src/app/globals.css`                        | The full mzizi 4.1.0/4.2.0 token set (tanzanite `--primary`) |
| `src/app/actions/discovery.ts`, `kiosk.ts`   | The signage wall's data actions             |

Three mechanisms make the cross-directory imports work:

1. **npm workspaces** — the repo root `package.json` declares
   `"workspaces": ["admin"]`, so one hoisted `node_modules` (and one
   lockfile) serves both apps. Install always runs at the repo root.
2. **tsconfig paths** — `@/*` maps to `../src/*` (shared code compiles
   unchanged); `@admin/*` maps to this app's own `src/`.
3. **`outputFileTracingRoot` + `turbopack.root`** (in `next.config.ts`) point
   at the repo root so Vercel's file tracing and Turbopack include modules
   outside the app directory.

Tailwind v4 note: `src/app/globals.css` (admin) imports the root stylesheet
and registers `../src` via `@source` so shared component classes are
generated when the build runs from `admin/`.

## Auth & the admin gate

WorkOS hosted AuthKit, same environment as the public app but with **this
project's own redirect URI**:

- Anonymous → the **proxy's middleware-auth mode** (`authkitProxy({
  middlewareAuth: { enabled: true } })`) redirects every unauthenticated page
  request to the hosted sign-in with a return path back to the requested
  admin page (the proxy is the only layer that can set the PKCE/state
  cookies); WorkOS returns to **this app's `/callback`**. Only `/denied` and
  `/callback` are reachable anonymously.
- Every route is **server-gated** by `requireAdmin()`
  (`src/lib/require-admin.ts` — the contract extracted from the old
  `src/app/admin/require-admin.ts`): `identity.persons.role` decides access,
  suspended accounts and lookup failures are denied, and denials land on the
  clear `/denied` screen. The shell layout gates at `moderator` (locked nav
  affordances), data pages at `admin`, settings at `super_admin`.
- **nyuchi WorkOS organization scoping** (`src/lib/workos-org.ts`) — layered
  **on top of** the role gate: every requester must be an **active member of
  the nyuchi WorkOS organization**. Anyone who authenticates but isn't in that
  org is denied (→ `/denied`) **regardless of role** — org membership is
  *necessary*, not *sufficient* (a member still needs the right role for a
  page). Mechanics:
  - **Allowed org** — resolved from `WORKOS_ADMIN_ORG_ID` when set (preferred,
    precise, no lookup); otherwise resolved by the `nyuchi.com` domain via the
    WorkOS SDK (`organizations.listOrganizations({ domains: ["nyuchi.com"] })`)
    and cached per server process.
  - **Membership** — the WorkOS `userManagement.listOrganizationMemberships`
    API (`statuses: ["active"]`) is the **source of truth**; the AuthKit
    session's `organizationId` is only a hint. The org check runs **before**
    the `identity.persons` role lookup, so a non-member never touches the
    cluster.
  - **Fail closed** — an unresolvable org or any WorkOS lookup error **denies**
    (never falls open). Missing WorkOS env still 503s at the proxy.
  - **Org-scoped sign-in** — the `/denied` re-auth affordance builds the hosted
    sign-in with `getSignInUrl({ organizationId })` so the WorkOS screen is
    nyuchi-scoped. This is a hint; the server-side membership gate is the real
    enforcement. (The proxy's anonymous middleware-auth bounce stays as-is —
    the gate catches any non-member it lets reach a route.)
- No client-only gating anywhere.

## Sections

| Route        | Gate         | What it does                                                            |
| ------------ | ------------ | ----------------------------------------------------------------------- |
| `/`          | admin        | Overview — hero RSVP stat, mineral stat tiles (users/events/entities/circles/calendars), recent activity |
| `/events`    | admin        | Search/filter table; publish / cancel / archive transitions; `mukoko.featured` toggle |
| `/people`    | admin        | `identity.persons` — search, role (admin-flag) management*, suspension  |
| `/entities`  | admin        | Host entities + memberships drill-down                                  |
| `/circles`   | admin        | Circles — visibility (circleType), member/post counts (read-only)       |
| `/calendars` | admin        | `events.calendars` — visibility, follower/event counts                  |
| `/support`   | admin        | Ticket queue UI (empty until tickets are modelled in v3.1)              |
| `/signage`   | admin        | Kiosk-paired analytics wall (ported as-is)                              |
| `/settings`  | super_admin  | `system.platformSettings` singleton                                     |

\* granting admin/super_admin (or touching an account that holds one)
requires super_admin — enforced in the server action.

## Local development

```bash
# From the REPO ROOT (workspace install)
npm install

cd admin
npm run dev        # http://localhost:11826
npm run build      # production build (standalone)
npm run lint
npm run test:run   # vitest (gate, shell, section renders)
```

Set the env vars below in `admin/.env.local`. Without `MONGODB_URI` the
pages render with empty degradation; without the WorkOS vars every request
answers 503 (this app has no anonymous surface).

**Local dev without WorkOS:** `DEV_AUTH_BYPASS=1 npm run dev` signs you in as
the synthetic dev super admin (same `NODE_ENV !== "production"` double gate
as the public app — impossible on deployments). `DEV_AUTH_ROLE=user` (or
`moderator`/`admin`) exercises the real deny paths, e.g. the `/denied`
bounce.

## Vercel project setup

Create a **second Vercel project** on this same Git repo:

| Setting              | Value                                                   |
| -------------------- | ------------------------------------------------------- |
| Root Directory       | `admin`                                                 |
| Framework Preset     | Next.js                                                 |
| Node.js Version      | 20+                                                     |
| Include files outside root directory | **Enabled** (default) — required, the app imports `../src` |
| Install Command      | default (`npm install`) — Vercel detects the npm workspace and installs at the repo root |
| Domain               | `admin.nhimbe.com` (or your choice — keep the public app's `ADMIN_URL` redirect in sync) |

### Environment variables (prod + preview)

| Variable                          | Notes                                                              |
| --------------------------------- | ------------------------------------------------------------------ |
| `MONGODB_URI`                     | Same Mukoko v3.1 cluster as the public app                         |
| `WORKOS_CLIENT_ID`                | Same WorkOS environment as the public app                          |
| `WORKOS_API_KEY`                  | Server-only                                                        |
| `WORKOS_COOKIE_PASSWORD`          | ≥32 chars; may differ from the public app's                        |
| `WORKOS_ADMIN_ORG_ID`             | **Recommended.** The nyuchi WorkOS **organization id** (`org_…`) allowed into the admin app. When set it is used directly (no lookup); when unset the org is resolved by the `nyuchi.com` domain and cached per process. Set this in production for a precise, lookup-free gate. |
| `NEXT_PUBLIC_WORKOS_REDIRECT_URI` | **`https://admin.nhimbe.com/callback`** — this project's own domain |
| `WORKOS_API_HOSTNAME`             | `authenticate.nyuchi.com` (custom API domain — must match the same WorkOS environment) |
| `NEXT_PUBLIC_SITE_URL`            | `https://nhimbe.com` — "View site" links + event/calendar deep links |

### WorkOS dashboard

Add the admin callback to the environment's **redirect URI allow-list**:
`https://admin.nhimbe.com/callback` (plus preview-domain URIs if you sign in
on previews). Everything else (hosted UI at `identity.nyuchi.com`, MFA,
passkeys, social) is shared with the public app — no further changes.

### Public app

Set `ADMIN_URL` on the **public** app's Vercel project if the admin domain is
not `https://admin.nhimbe.com` — it drives the `/admin/*` redirects.
