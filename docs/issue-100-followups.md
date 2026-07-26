# Issue #100 — Part-5 follow-ups

Findings from the three part-5 investigations attached to issue #100. This is a
record so the work is not lost; only the low-risk change (if clearly correct)
was applied in the same pass. The MCP-worker and admin-app extraction (parts
A/1–4) landed alongside this document.

## 1. Command palette → autocomplete swap (BLOCKED on #93)

**Status: blocked — no code change made.**

The header ⌘K palette (`src/components/layout/header.tsx`) currently powers its
live event results with the heavier semantic-search action:

- Import: `src/components/layout/header.tsx:26`
  `import { searchEventsAction } from "@/app/actions/search";`
- Use site: `src/components/layout/header.tsx:46` inside `searchPalette()`
  `const { events } = await searchEventsAction({ query, limit: 6 });`

`searchEventsAction` (`src/app/actions/search.ts`) runs the full Atlas
`$vectorSearch` retrieval **and** asks the Shamwari Qwen gateway for a summary on
every keystroke-debounced call — far more than a type-ahead needs.

The intended lighter action, **`autocompleteEventsAction`**, does **not exist on
this branch** (a repo-wide grep for `autocompleteEventsAction` returns only the
issue text — no definition, no caller). It arrives with **#93 (hybrid search)**.
Per the issue's instruction, the swap was therefore **not** applied.

**Exact change to make once #93 merges** (a two-line edit, no other logic):

```diff
- import { searchEventsAction } from "@/app/actions/search";
+ import { autocompleteEventsAction } from "@/app/actions/search";
  ...
-   const { events } = await searchEventsAction({ query, limit: 6 });
+   const { events } = await autocompleteEventsAction({ query, limit: 6 });
```

Confirm the #93 action's return shape still exposes an `events: Event[]` field
(the palette maps `events` → `CommandPaletteItem[]`); adjust the destructure if
that action names it differently. The full `/search` page (`src/app/search/page.tsx`)
should keep using `searchEventsAction` — it wants the semantic results and the
AI summary.

## 2. SSR-first sweep of `/search`, `/my-events`, `/calendar`, `/profile`

Evaluation only — **no conversions in this pass** (too risky to bundle with the
split). All four are currently `"use client"` root pages that fetch through
server actions in a `useEffect`. Recommendations:

| Page | Verdict | Reasoning |
| --- | --- | --- |
| `/search` | **Keep client (hybrid candidate)** | Genuinely interactive: debounced query state, `activeCategories` filter chips, `recentSearches` persisted in `localStorage` (`nhimbe-recent-searches`), live semantic results + AI summary, `useMemo` derived lists. A full SSR conversion is not worth it. The realistic refactor is a **hybrid**: an SSR shell that server-renders the initial category list / trending and an optional `?q=` seeded result set (via `searchEventsAction` on the server), with a thin client island owning the input, filters, and recent-search storage. Defer; pairs naturally with #93. |
| `/my-events` | **Safe SSR candidate** | Data is entirely server-owned (`getMyEvents` → attending/hosting/past) and the only client state is `activeTab`. It renders behind `AuthGuard` + `useAuth` today, but the same gating is available server-side via `withAuth()` / `resolveActingPerson`. Recommended shape: an RSC that resolves the acting person, fetches `getMyEvents` server-side, and renders a small client tab-switcher island for attending/hosting/past. Removes a client fetch + auth round-trip and a loading spinner. **Best first candidate.** |
| `/calendar` | **Partial SSR candidate** | Events come from `getEventsAction` (server-owned); client state is `selectedDate` and the derived month grid (`useMemo`). Month navigation and day selection are inherently interactive, so the `NyuchiCalendar` stays a client island — but the event fetch can move to an RSC parent that passes events down as props, dropping the `useEffect` fetch + spinner. Medium effort; do after `/my-events`. |
| `/profile` | **Keep client** | Almost entirely client-interactive: `signOut`, theme cycling, a `notifications` toggle, a sign-out confirm dialog, `useRouter` redirects, and `useAuth` (`user`, `profileCompleteness`). It reads from auth context rather than a server fetch. Little SSR upside; a thin SSR wrapper that pre-resolves `user` server-side is possible but low value. **Leave as-is.** |

Suggested order when picked up: `/my-events` → `/calendar` → `/search` (hybrid,
with #93) → `/profile` (optional/last).

## 3. MongoDB "repeated things" (duplicate-data concern)

No DB access was performed for this pass — this is a state capture so the thread
is not lost.

**Already swept clean** (per the issue): duplicate/denormalized data was
reconciled across these collections and their screens —

- `campfire.conversations` — event-paired system conversations (the event-update
  → Campfire write-through find-or-creates one per event; no duplicate
  conversations).
- `events.events` — the canonical event documents.
- `identity.persons` — the WorkOS user mirror; provisioning converges on a
  single idempotent `syncPersonFromWorkos` upsert keyed on `workosUserId` across
  webhook + callback + lazy-sync, so the same user is not written twice.
- `entity.entities` — host entities; WorkOS org mirroring find-or-creates a
  single minimal entity keyed on `workosOrganizationId`.

**Still open — needs a follow-up with DB access:** the original
duplicate-data concern was **never pinpointed to a specific collection or
screen**. A follow-up should:

1. Identify the exact surface where duplication was observed (the issue did not
   name it — likely a listing or drill-down where the same event/host appeared
   more than once).
2. Check the denormalized counters and cross-product mirrors for divergence
   rather than literal duplicate rows — the likely suspects are
   `events.calendars.followerCount` / `eventCount` vs the `events.calendarFollows`
   truth, engagement counters (`engagement.interactions` saves,
   `engagement.reactions` likes), and the RSVP → `planner.reservations` mirror
   (idempotent on `(reservedPersonId, iCalUid)` — verify no stale duplicates
   predate the idempotency key).
3. Confirm the shared published-and-visible predicate
   (`src/lib/mongo/event-filters.ts`) yields count/drill-down parity, since a
   mismatch there reads as "repeated" or missing events on `/discover` vs
   `/events`.

Recommend attaching a short read-only aggregation audit (group-by on the
candidate keys, counts > 1) to the next DB-connected session and recording the
result here.
