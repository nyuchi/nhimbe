# Release Process

nhimbe uses **continuous deployment** with manual version tags for milestones.

## Deployment

- **Preview** — every pull request gets an isolated preview deployment so changes can be reviewed in a running environment.
- **Production** — merging to `main` deploys to production automatically.
- **Rollback** — previous deployments can be promoted again from the hosting dashboard if a release needs to be reverted.

Anything stack- or environment-specific (bindings, secrets, data ownership) is documented in **[CLAUDE.md](./CLAUDE.md)**, which is kept current as the architecture evolves.

## Versioning

We follow [Semantic Versioning](https://semver.org/):

- **MAJOR** (`X.0.0`) — breaking changes or major platform shifts
- **MINOR** (`0.X.0`) — new features, backwards-compatible
- **PATCH** (`0.0.X`) — bug fixes, security patches, documentation

## Cutting a release

1. Make sure `main` is stable and all CI checks pass.
2. Tag the release:

   ```bash
   git tag -a v1.0.0 -m "v1.0.0: Launch release"
   git push origin v1.0.0
   ```

3. Draft a GitHub Release from the tag, write the notes (format below), and publish.

### Release notes format

```markdown
## What's New
- Feature description (#PR)

## Bug Fixes
- Fix description (#PR)

## Security
- Security improvement (#PR)

## Infrastructure
- CI / deployment changes (#PR)

## Breaking Changes
- What changed and the steps to migrate
```

## Hotfix process

For a critical production issue:

1. Branch from `main`: `hotfix/<description>`.
2. Make the smallest change that fixes it.
3. Add a test that covers the fix.
4. Open a PR, get review, and merge.
5. Confirm the production deployment.
6. Tag a patch release.

## Pre-release checklist

Before a major release:

- [ ] All CI checks passing
- [ ] Security review completed (no high-severity issues outstanding)
- [ ] Environment variables and secrets configured for production
- [ ] Cross-origin and rate-limit settings verified for production domains
- [ ] Health check responding
- [ ] Transactional email verified
- [ ] Payment webhooks configured
- [ ] DNS and custom domains in place
- [ ] Monitoring and alerting active
