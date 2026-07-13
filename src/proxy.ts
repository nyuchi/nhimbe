import { authkitProxy } from "@workos-inc/authkit-nextjs";
import { NextResponse, type NextRequest } from "next/server";

// Next.js 16+ proxy (was middleware in <=15). AuthKit uses this for session
// cookie management on the routes that need a logged-in user. Pages that
// don't appear in the matcher are still publicly viewable; AuthKit only
// touches them via withAuth() / useAuth() on demand.
//
// Preview-deployment resilience: when WORKOS_COOKIE_PASSWORD is missing or
// empty, authkitProxy() throws at module-load time and every request
// becomes a 500. Anonymous browsing should still work, so we detect the
// misconfig and short-circuit to a no-op pass-through. The site renders
// as logged-out; auth flows return a clear 503 instead of a generic crash.
//
// Required env (per @workos-inc/authkit-nextjs):
//   WORKOS_CLIENT_ID                — Client ID from the WorkOS dashboard
//   WORKOS_API_KEY                  — server-only API key (sk_…)
//   WORKOS_COOKIE_PASSWORD          — 32+ chars, encrypts the session cookie
//   NEXT_PUBLIC_WORKOS_REDIRECT_URI — *MUST* have NEXT_PUBLIC_ prefix —
//                                     AuthKit reads this client-side to form
//                                     the OAuth callback URL.
// Optional:
//   WORKOS_API_HOSTNAME             — defaults to api.workos.com. Set to
//                                     identity.nyuchi.com to route all
//                                     WorkOS API calls (and hosted AuthKit
//                                     UI) through the custom domain.
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

const upstream = AUTH_READY ? authkitProxy() : null;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default async function proxy(request: NextRequest, ctx: any) {
  if (!AUTH_READY) {
    // Auth flows can't function without env — short-circuit them with a
    // clear 503 so the failure is observable rather than silent. Everything
    // else passes through unmodified.
    const path = request.nextUrl.pathname;
    if (path.startsWith("/auth/") || path === "/callback") {
      return new NextResponse("WorkOS environment is not configured on this deployment.", { status: 503 });
    }
    return NextResponse.next();
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (upstream as any)(request, ctx);
}

export const config = {
  // Run on every page-style route, but skip Next's static / image / favicon
  // pipelines so Tailwind v4 + image optimisation aren't intercepted.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|sw.js|manifest.json|.*\\..*).*)"],
};
