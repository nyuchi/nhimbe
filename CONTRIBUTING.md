# Contributing to nhimbe

Thanks for your interest in nhimbe — the community events platform of the [Mukoko](https://mukoko.com) ecosystem. Contributions of every kind are welcome, from bug reports and docs to features and fixes.

Come say hello first if you like: **[discord.gg/CP2P4JpPR](https://discord.gg/CP2P4JpPR)**.

## Ways to contribute

- **Report a bug** or **request a feature** using the [issue templates](.github/ISSUE_TEMPLATE/).
- **Improve the docs** — typos, clarity, and missing context are all fair game.
- **Pick up an issue** — anything labelled `good first issue` is a friendly place to start.
- **Open a pull request** for a fix or feature.

## Local development

You'll need a recent **Node.js LTS** and **npm**.

```bash
npm install      # install dependencies
npm run dev      # start the local dev server
npm run lint     # lint
npm run build    # production build
npm run test:run # run the test suite
```

Configuration is supplied through environment variables. Copy the example file and fill in your own values:

```bash
cp .env.example .env.local
```

The full list of variables, and how the app fits together, lives in **[CLAUDE.md](./CLAUDE.md)** — the architecture and contributor reference. Treat it as the source of truth for anything stack-specific so this guide can stay evergreen.

## Workflow

1. **Branch from `main`** with a descriptive name — `feat/event-reminders`, `fix/registration-race`, `docs/readme`.
2. **Make your change** following the conventions below.
3. **Run the checks locally** (`lint`, `build`, `test:run`) before pushing.
4. **Open a pull request** against `main`. CI must pass before merge.

### Pull request style — big PR, focused commits

The Nyuchi house style is **one pull request, many focused commits**. Group related work into a single PR as a sequence of independently readable commits, rather than chaining lots of tiny PRs. If you think of "just one more cleanup," append a commit to the open PR instead of opening another. Open PRs as **draft** until they're ready for review.

## Code conventions

- **Brand:** always lowercase **"nhimbe"** — even at the start of a sentence.
- **TypeScript strict mode** throughout.
- **Accessibility:** target **WCAG AAA** — strong contrast and comfortable, consistent touch targets.
- **No hardcoded content:** categories, cities, and stats come from data, not literals.
- **Structured logging:** prefix log output with `[mukoko]`.
- **Schema.org alignment:** model events and people after schema.org where it applies.
- **Internationalisation:** keep user-facing strings translatable (English and Shona today).
- Match the style of the surrounding code — naming, comments, and idioms.

See **[CLAUDE.md](./CLAUDE.md)** for architecture, data ownership, and the deeper conventions.

## Data & schema changes

The data schema is owned by the platform data project, **not this repository** — this repo consumes it. If your change needs a schema modification, coordinate that change in the platform project first, then update the consumer code here. See **[CLAUDE.md](./CLAUDE.md)** for details.

## Reporting security issues

Please **do not** open a public issue for security vulnerabilities. Follow the process in **[SECURITY.md](./SECURITY.md)**.

## License

By contributing, you agree that your contributions are licensed under the [MIT License](./LICENSE).
