import type { NextConfig } from "next";

/**
 * Content-Security-Policy.
 *
 * Conservative baseline: it locks down the high-value, low-breakage
 * directives (`object-src`, `base-uri`, `frame-ancestors`, `form-action`)
 * while keeping `script-src`/`style-src` permissive enough for Next.js's
 * inline hydration bootstrap and the Google Maps JS SDK. Allow-lists cover
 * the third parties the app legitimately talks to:
 *   - Google Maps  (maps.googleapis.com / maps.gstatic.com, tiles, fonts)
 *   - Cloudflare R2 assets (assets-s001.mukoko.com and the *.mukoko.com zone)
 *   - WorkOS AuthKit (api.workos.com + the authenticate.nyuchi.com domain)
 *
 * `script-src` still needs `'unsafe-inline'`/`'unsafe-eval'` because the app
 * does not yet emit per-request nonces and Maps evals at runtime; tightening
 * to a nonce/`strict-dynamic` policy is tracked as follow-up hardening. Even
 * so, `frame-ancestors 'none'`, `object-src 'none'` and `base-uri 'self'`
 * already neutralise clickjacking, plugin/object injection and `<base>` tag
 * hijacking.
 */
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://maps.googleapis.com https://maps.gstatic.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data: https://fonts.gstatic.com",
  "connect-src 'self' https://api.workos.com https://authenticate.nyuchi.com https://maps.googleapis.com https://*.mukoko.com",
  "frame-src 'self' https://*.google.com",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "upgrade-insecure-requests",
].join("; ");

const nextConfig: NextConfig = {
  // Don't advertise the framework via the `X-Powered-By: Next.js` response
  // header — it's free reconnaissance for an attacker and offers no value to
  // legitimate clients.
  poweredByHeader: false,
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
