/**
 * The site's PRIMARY (canonical) origin.
 *
 * Nhimbe runs on a dual-domain production setup: both `nhimbe.com` and
 * `events.mukoko.com` fully serve the app (Vercel serves both; the browser
 * always talks to its own origin via `window.location.origin`, so runtime
 * behaviour is identical on either host). What must NOT vary per host is the
 * set of self-referential URLs search engines and scrapers consume — canonical
 * tags, OpenGraph/Twitter image URLs, the sitemap, robots, and schema.org
 * JSON-LD. Those all point at ONE primary origin so SEO signals consolidate on
 * a single domain instead of splitting across both (duplicate content).
 *
 * The primary is `events.mukoko.com` (the Mukoko-ecosystem domain). Override
 * per environment with `NEXT_PUBLIC_SITE_URL` (the `NEXT_PUBLIC_` prefix keeps
 * this usable from client components too). Any trailing slash is trimmed so
 * `absoluteUrl("/x")` never produces a double slash.
 *
 * NOT for opaque stable identifiers (iCalendar UIDs, external-API User-Agent
 * strings) — those must stay constant regardless of the serving domain.
 */
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL || "https://events.mukoko.com"
).replace(/\/+$/, "");

/** Build an absolute URL on the primary origin from a path. */
export function absoluteUrl(path = "/"): string {
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}
