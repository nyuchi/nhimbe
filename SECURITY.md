# Security Policy

The safety of the Nhimbe community matters to us. We welcome responsible disclosure and will work with you to resolve genuine issues quickly.

## Supported versions

| Version | Supported |
| --- | --- |
| Latest on `main` | ✅ |
| Older releases | ❌ |

Nhimbe is continuously deployed, so the latest `main` is the only supported version. Fixes land there and roll out from there.

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

Nhimbe is built with defense-in-depth. Without enumerating implementation that changes over time, our baseline includes:

- **Authentication & authorization** — identity is handled by **WorkOS AuthKit** and verified server-side on every request; access is role-based and least-privilege; suspended accounts are denied.
- **Data** — application data lives in **MongoDB** and is read and written server-side only; no secrets or personal data are committed to this repository.
- **Input handling** — user and AI inputs are validated, length-limited, and sanitized; uploads are type- and size-checked.
- **Transport & headers** — HTTPS is enforced, with hardened response headers and a restrictive cross-origin policy.
- **Secrets** — credentials live in managed secret storage, never in source or client code.
- **Abuse resistance** — endpoints are rate-limited, and external dependencies are called through resilience patterns that fail safe.
- **Accountability** — destructive actions are audit-logged, and error responses never leak internal detail.
- **Dependencies** — kept current and monitored for known vulnerabilities; security patches are prioritized.

### Hardening reference

Concrete detail behind the baseline above, for reviewers and future contributors:

- **Response headers** (`next.config.ts` `headers()`, applied to every path):
  - A **Content-Security-Policy** with `default-src 'self'`, `object-src 'none'`,
    `base-uri 'self'`, `frame-ancestors 'none'` and `form-action 'self'`. The
    `script-`/`style-`/`img-`/`font-`/`connect-`/`frame-src` directives allow-list
    only OpenStreetMap tiles (`*.tile.openstreetmap.org`, CyclOSM, OpenTopoMap),
    OSM Nominatim geocoding (`nominatim.openstreetmap.org`), the Mukoko weather
    embed (`weather.mukoko.com`), Cloudflare R2 assets (`*.mukoko.com`), WorkOS
    (`api.workos.com`, `authenticate.nyuchi.com`, `identity.nyuchi.com`) and
    Google Fonts (`fonts.googleapis.com`, `fonts.gstatic.com`). `script-src`
    still permits `'unsafe-inline'`/`'unsafe-eval'` for Next.js's inline
    hydration bootstrap — tightening this to a per-request nonce /
    `strict-dynamic` policy is the main outstanding CSP hardening item.
  - `Strict-Transport-Security` (2-year `max-age`, `includeSubDomains`, `preload`),
    `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`,
    `Referrer-Policy: strict-origin-when-cross-origin`,
    `Cross-Origin-Opener-Policy: same-origin-allow-popups`,
    `Cross-Origin-Resource-Policy: same-origin`,
    `X-Permitted-Cross-Domain-Policies: none`, and a `Permissions-Policy` that
    denies camera, microphone, geolocation, payment, USB, sensors and the Topics
    API. `X-Powered-By` is disabled.
- **Session cookie** — issued by WorkOS AuthKit (`saveSession`) as `HttpOnly`,
  `SameSite=Lax`, AES-encrypted with `WORKOS_COOKIE_PASSWORD`. The `Secure`
  flag is derived from the redirect URI's scheme, so
  `NEXT_PUBLIC_WORKOS_REDIRECT_URI` **must be `https://…`** in every deployed
  environment for the cookie to be marked `Secure`. `WORKOS_COOKIE_SAMESITE`
  and `WORKOS_COOKIE_DOMAIN` can override the defaults if ever needed.
- **API input validation** — the same-origin route handlers (`src/app/api/**`)
  run untrusted input through `src/lib/security/request.ts`: query integers are
  NaN-guarded and range-clamped, JSON bodies are read behind a 64 KiB cap, and
  string/array fields are length- and count-capped before reaching MongoDB.
  Cover-image uploads are additionally checked by **magic bytes**
  (`src/lib/security/image.ts`) so a spoofed `Content-Type` can't smuggle
  SVG/HTML/polyglot content past the type gate.

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
