import type { NextConfig } from "next";
import path from "node:path";

/**
 * nhimbe-admin — standalone Next.js app deployed as its own Vercel project
 * (root directory: `admin/`).
 *
 * The admin app deliberately owns NO data or design-system code: the MongoDB
 * layer (`../src/lib/mongo`), the auth helpers (`../src/lib/auth`) and the
 * Mukoko/nyuchi UI library (`../src/components/ui`) are imported straight from
 * the repo root via the `@/*` tsconfig alias. Two knobs make that work when
 * the build runs from inside `admin/`:
 *
 *  - `outputFileTracingRoot` points at the repo root so Vercel's file tracing
 *    includes modules that live outside this app directory.
 *  - `turbopack.root` matches, so Turbopack treats the repo root (where the
 *    single npm-workspace lockfile lives) as the project boundary.
 */
const REPO_ROOT = path.join(__dirname, "..");

/**
 * Content-Security-Policy — stricter than the public app: the admin surface
 * frames nothing, embeds no maps/weather, and only talks to WorkOS (session
 * auth) besides itself. `script-src` keeps 'unsafe-inline' for Next's inline
 * hydration bootstrap (same caveat as the public app).
 */
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data: https://fonts.gstatic.com",
  "connect-src 'self' https://api.workos.com https://authenticate.nyuchi.com https://identity.nyuchi.com",
  "frame-src 'none'",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "upgrade-insecure-requests",
].join("; ");

const nextConfig: NextConfig = {
  poweredByHeader: false,
  outputFileTracingRoot: REPO_ROOT,
  turbopack: {
    root: REPO_ROOT,
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "*.mukoko.com" },
      { protocol: "https", hostname: "*.nhimbe.com" },
      { protocol: "https", hostname: "*.r2.dev" },
    ],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: CONTENT_SECURITY_POLICY },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // The admin dashboard is an internal tool — never index it.
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
          { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
          { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
          {
            key: "Permissions-Policy",
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
