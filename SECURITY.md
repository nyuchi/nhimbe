# Security Policy

The safety of the nhimbe community matters to us. We welcome responsible disclosure and will work with you to resolve genuine issues quickly.

## Supported versions

| Version | Supported |
| --- | --- |
| Latest on `main` | ✅ |
| Older releases | ❌ |

nhimbe is continuously deployed, so the latest `main` is the only supported version. Fixes land there and roll out from there.

## Reporting a vulnerability

**Please do not open a public GitHub issue for security vulnerabilities**, and don't disclose them in the community Discord.

Instead, email **security@nyuchi.com** with:

1. A description of the vulnerability
2. Steps to reproduce
3. The potential impact
4. A suggested fix, if you have one

We'll acknowledge your report within **48 hours** and aim to provide a detailed response within **5 business days**. We'll coordinate a fix with you and agree on disclosure timing before anything is made public.

## Our commitments

- We investigate every good-faith report.
- We keep you updated on progress toward a fix.
- We credit reporters who'd like to be acknowledged, once a fix has shipped.

## Security practices

nhimbe is built with defense-in-depth. Without enumerating implementation that changes over time, our baseline includes:

- **Authentication & authorization** — identity is verified on every request; access is role-based and least-privilege; suspended accounts are denied.
- **Input handling** — user and AI inputs are validated, length-limited, and sanitized; uploads are type- and size-checked.
- **Transport & headers** — HTTPS is enforced, with hardened response headers and a restrictive cross-origin policy.
- **Secrets** — credentials live in managed secret storage, never in source or client code.
- **Abuse resistance** — endpoints are rate-limited, and external dependencies are called through resilience patterns that fail safe.
- **Accountability** — destructive actions are audit-logged, and error responses never leak internal detail.
- **Dependencies** — kept current and monitored for known vulnerabilities; security patches are prioritized.

## Scope

In scope:

- Authentication or authorization bypasses
- Injection vulnerabilities (including cross-site scripting and prompt injection)
- Data exposure or leakage
- Cross-origin misconfigurations
- Payment-flow vulnerabilities
- Rate-limit bypasses

Out of scope:

- Denial-of-service / volumetric attacks
- Social engineering
- Vulnerabilities in third-party services we depend on (report those to the provider)
