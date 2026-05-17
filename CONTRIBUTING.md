# Contributing to nhimbe

nhimbe is the community events platform within the Mukoko ecosystem. We welcome contributions that improve the platform for our users across Africa and beyond.

## Getting Started

### Prerequisites

- Node.js 20+
- npm
- Wrangler CLI (`npm install -g wrangler`)

### Local Development

```bash
# Frontend
npm install && npm run dev        # http://localhost:3000

# Backend
cd worker && npm install && npm run dev   # http://localhost:8787
```

### Environment Variables

Copy the example files and fill in your values:

```bash
# Frontend
cp .env.example .env.local

# Backend
cp worker/.dev.vars.example worker/.dev.vars
```

See [CLAUDE.md](./CLAUDE.md) for the full list of required environment variables.

## Development Workflow

1. **Create a branch** from `main` with a descriptive name:

   - `feat/event-reminders` for new features
   - `fix/registration-race-condition` for bug fixes
   - `docs/update-api-reference` for documentation

2. **Make your changes** following the conventions below.

3. **Run checks locally** before pushing:

   ```bash
   npm run lint                          # ESLint
   npm run build                         # Next.js build
   npx vitest run                        # Frontend tests (160 tests)
   cd worker && npx tsc --noEmit         # Worker type check
   cd worker && npx vitest run           # Worker tests (124 tests)
   ```

4. **Push and open a pull request** against `main`. CI runs 4 parallel jobs that must all pass. Per Nyuchi house style: **big PR, multiple commits** — group related work into one PR as a sequence of focused commits, rather than chaining tiny PRs.

## Code Conventions

- **TypeScript strict mode** in both frontend and backend
- **Brand**: Always lowercase "nhimbe" -- even at sentence start
- **Tailwind CSS v4** with `cn()` helper for conditional classes
- **`"use client"`** directive required for interactive React components
- **WCAG AAA** compliance -- 7:1+ contrast ratios, 44px touch targets
- **Structured logging** -- `[mukoko]` prefix on all log output
- **No hardcoded data** -- categories, cities, stats all come from the database
- **Schema.org alignment** -- events and users modeled after schema.org specs
- **Path alias** -- `@/*` maps to `./src/*` in frontend imports

## Architecture

See [CLAUDE.md](./CLAUDE.md) for the complete architecture guide including:

- Backend routing (18 Hono route modules)
- Authentication flow (WorkOS AuthKit + JWKS validation)
- Database (Supabase Postgres via PostgREST — schema owned by `nyuchi_platform_db`)
- AI features (RAG search, description wizard)
- Resilience patterns (circuit breaker, retry with backoff)

## Testing

### Frontend Tests

```bash
npx vitest run                          # All frontend tests
npx vitest run src/lib/api.test.ts      # Single file
```

Tests use Vitest + jsdom + React Testing Library. Config: `vitest.config.ts`.

### Backend Tests

```bash
cd worker && npx vitest run                              # All worker tests
cd worker && npx vitest run src/__tests__/auth.test.ts   # Single file
```

Tests use Vitest with a 3-layer mock architecture (D1 mock was retired with the Supabase migration). Config: `worker/vitest.config.ts`. Stub global `fetch` to test `supabaseFetch()`-based routes.

### Writing Tests

- Frontend tests colocate with modules (`src/lib/api.test.ts`) or live in `src/__tests__/`
- Backend tests live in `worker/src/__tests__/`
- Use the mock helpers in `worker/src/__tests__/mocks.ts` for backend tests
- Test files are excluded from `worker/tsconfig.json` (type check only covers production code)

## Database Migrations

The schema lives in the `nyuchi_platform_db` Supabase project, **not in this repo**. Apply migrations from there using either the Supabase MCP (`apply_migration`) or `supabase db push`. This repo only consumes the schema via `worker/src/db/supabase.ts` (PostgREST) and `src/lib/supabase/`.

If your change requires a schema modification, open a separate PR against `nyuchi_platform_db` first, then update consumer code in this repo to use the new columns/tables.

## Pull Request Guidelines

- **Big PR, multiple commits** — the Nyuchi house style. Group related work into one PR as a sequence of focused commits. Each commit is independently reviewable; the PR groups them by intent. Don't open a second PR for "just one more cleanup" — append a commit.
- Write a clear description of what changed and why
- Include test coverage for new functionality
- Update `CLAUDE.md` if the architecture changes
- All 4 CI checks must pass before merge

## Reporting Issues

Use the [GitHub issue templates](.github/ISSUE_TEMPLATE/) for:

- Bug reports
- Feature requests

## Security

See [SECURITY.md](./SECURITY.md) for reporting security vulnerabilities.

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
