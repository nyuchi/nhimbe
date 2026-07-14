import type { NextConfig } from "next";

/**
 * Content-Security-Policy.
 *
 * Conservative baseline: it locks down the high-value, low-breakage
 * directives (`object-src`, `base-uri`, `frame-ancestors`, `form-action`)
 * while keeping `script-src`/`style-src` permissive enough for Next.js's
 * inline hydration bootstrap. Maps + address search now run on OpenStreetMap
 * (Leaflet tiles, key-less) with server-side Nominatim geocoding, so no Google
 * Maps origins are needed. Allow-lists cover the third parties the app
 * legitimately talks to:
 *   - OpenStreetMap tiles (tile.openstreetmap.org, CyclOSM, OpenTopoMap) —
 *     images only; loaded client-side by Leaflet.
 *   - OSM Nominatim geocoding (nominatim.openstreetmap.org) — server-side
 *     fetch; listed in connect-src for defence in depth.
 *   - Mukoko weather embed (weather.mukoko.com) — framed weather widget.
 *   - Cloudflare R2 assets (assets-s001.mukoko.com and the *.mukoko.com zone)
 *   - WorkOS AuthKit (api.workos.com + the authenticate.nyuchi.com custom API
 *     domain + the identity.nyuchi.com AuthKit domain — hosted UI / OAuth)
 *
 * `script-src` still needs `'unsafe-inline'`/`'unsafe-eval'` because the app
 * does not yet emit per-request nonces; tightening to a nonce/`strict-dynamic`
 * policy is tracked as follow-up hardening. Even so, `frame-ancestors 'none'`,
 * `object-src 'none'` and `base-uri 'self'` already neutralise clickjacking,
 * plugin/object injection and `<base>` tag hijacking.
 */
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "img-src 'self' data: blob: https: https://*.tile.openstreetmap.org https://tile.openstreetmap.org https://*.tile-cyclosm.openstreetmap.fr https://*.tile.opentopomap.org",
  "font-src 'self' data: https://fonts.gstatic.com",
  "connect-src 'self' https://api.workos.com https://authenticate.nyuchi.com https://identity.nyuchi.com https://nominatim.openstreetmap.org https://weather.mukoko.com https://*.mukoko.com",
  "frame-src 'self' https://weather.mukoko.com",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "upgrade-insecure-requests",
].join("; ");

/**
 * The admin dashboard is its own app + Vercel project now (admin/ in this
 * repo). /admin on the public app forwards there. Env-configurable per
 * environment (build-time, like all next.config redirects); temporary (307)
 * so the destination can move without poisoning browser caches.
 */
const ADMIN_URL = (process.env.ADMIN_URL || "https://admin.nhimbe.com").replace(/\/+$/, "");

const nextConfig: NextConfig = {
  // Don't advertise the framework via the `X-Powered-By: Next.js` response
  // header — it's free reconnaissance for an attacker and offers no value to
  // legitimate clients.
  poweredByHeader: false,
  // Kraal → Circles rename (NYU-24): the user-facing routes moved to
  // /circles; the database was already `circles.*`. Permanent (308) so
  // search engines and old links transfer.
  async redirects() {
    return [
      { source: "/kraal", destination: "/circles", permanent: true },
      { source: "/kraal/:id", destination: "/circles/:id", permanent: true },
      // Admin extraction (#69): the dashboard lives in its own app/project.
      // Old in-app paths map onto the standalone app's routes (/admin/users
      // moved to /people there, so path passthrough is deliberately not used).
      { source: "/admin", destination: ADMIN_URL, permanent: false },
      { source: "/admin/users", destination: `${ADMIN_URL}/people`, permanent: false },
      { source: "/admin/:path*", destination: `${ADMIN_URL}/:path*`, permanent: false },
    ];
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.mukoko.com",
      },
      {
        protocol: "https",
        hostname: "*.nhimbe.com",
      },
      {
        protocol: "https",
        hostname: "*.r2.dev",
      },
    ],
  },
  // Security headers
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: CONTENT_SECURITY_POLICY },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-DNS-Prefetch-Control", value: "on" },
          // Isolate our browsing context from cross-origin windows/resources
          // so opener-based tab-nabbing and Spectre-style cross-origin reads
          // are contained. `same-origin-allow-popups` keeps the WorkOS/OAuth
          // popup and window.open flows working.
          { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
          { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
          { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
          {
            key: "Permissions-Policy",
            // Deny powerful features the app never uses; browsing-topics off
            // opts out of the Topics API. Geolocation stays off — the map
            // uses explicit city input, not the device location sensor.
            value:
              "accelerometer=(), autoplay=(), browsing-topics=(), camera=(), display-capture=(), encrypted-media=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
