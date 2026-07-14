import { authkitProxy } from "@workos-inc/authkit-nextjs";
import { NextResponse, type NextRequest } from "next/server";

// Next.js 16 proxy for the admin app — same AuthKit session-cookie
// management (and the same missing-env resilience) as the public app's
// src/proxy.ts, with one admin-specific difference: this app has NO
// anonymous surface, so a misconfigured deployment answers every request
// with a clear 503 instead of rendering a logged-out shell.
//
// Required env (per @workos-inc/authkit-nextjs):
//   WORKOS_CLIENT_ID                — Client ID from the WorkOS dashboard
//   WORKOS_API_KEY                  — server-only API key (sk_…)
//   WORKOS_COOKIE_PASSWORD          — 32+ chars, encrypts the session cookie
//   NEXT_PUBLIC_WORKOS_REDIRECT_URI — MUST point at THIS app's /callback
//                                     (e.g. https://admin.nhimbe.com/callback)
//                                     and be registered in the WorkOS
//                                     dashboard's redirect-URI allow-list.
// Optional:
//   WORKOS_API_HOSTNAME             — authenticate.nyuchi.com (custom API domain).
const WORKOS_PASSWORD = process.env.WORKOS_COOKIE_PASSWORD;
const WORKOS_API_KEY = process.env.WORKOS_API_KEY;
const WORKOS_CLIENT_ID = process.env.WORKOS_CLIENT_ID;
const WORKOS_REDIRECT_URI = process.env.NEXT_PUBLIC_WORKOS_REDIRECT_URI;
const AUTH_READY =
  typeof WORKOS_PASSWORD === "string" &&
  WORKOS_PASSWORD.length >= 32 &&
  typeof WORKOS_API_KEY === "string" &&
  WORKOS_API_KEY.length > 0 &&
  typeof WORKOS_CLIENT_ID === "string" &&
  WORKOS_CLIENT_ID.length > 0 &&
  typeof WORKOS_REDIRECT_URI === "string" &&
  WORKOS_REDIRECT_URI.length > 0;

// Local-only dev bypass (mirrors src/lib/auth/dev.ts in the public app —
// inlined because the proxy runtime can't import the server-only module).
// Vercel builds every environment as production, so this is impossible on
// any deployment.
const DEV_BYPASS =
  process.env.NODE_ENV !== "production" && process.env.DEV_AUTH_BYPASS === "1";

const upstream = AUTH_READY ? authkitProxy() : null;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default async function proxy(request: NextRequest, ctx: any) {
  if (!AUTH_READY) {
    if (DEV_BYPASS) {
      // requireAdmin() resolves the synthetic dev person itself.
      return NextResponse.next();
    }
    return new NextResponse(
      "WorkOS environment is not configured on this admin deployment.",
      { status: 503 },
    );
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (upstream as any)(request, ctx);
}

export const config = {
  // Run on every page-style route, but skip Next's static / image / favicon
  // pipelines.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
