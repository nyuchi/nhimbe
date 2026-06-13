import { NextResponse, type NextRequest } from "next/server";
import { getSignInUrl } from "@workos-inc/authkit-nextjs";

/**
 * Sign-in entry point — redirects to WorkOS AuthKit's hosted sign-in UI.
 *
 * This is a Route Handler (not an RSC page) on purpose: AuthKit persists
 * OAuth state in cookies when building the sign-in URL, and Next only allows
 * cookie writes in Route Handlers / Server Actions. The previous RSC page
 * crashed with "Cookies can only be modified in a Server Action or Route
 * Handler" whenever AuthKit touched the session.
 *
 * AuthKit owns the actual login form (magic link, OAuth, SSO) and returns the
 * user to /callback, which exchanges the code for a session cookie.
 */
export async function GET(request: NextRequest) {
  const returnToRaw = request.nextUrl.searchParams.get("return_to") ?? "/";
  // Relative paths only — block protocol-relative and absolute URLs.
  const returnTo =
    returnToRaw.startsWith("/") && !returnToRaw.startsWith("//") ? returnToRaw : "/";

  try {
    const url = await getSignInUrl({ returnTo });
    return NextResponse.redirect(url);
  } catch (err) {
    // WorkOS env missing or AuthKit proxy not configured on this deployment.
    // Fail observably instead of crashing the error boundary.
    console.error("[mukoko:auth] getSignInUrl failed:", err);
    return new NextResponse(
      "Sign-in is not available on this deployment (WorkOS configuration missing).",
      { status: 503 },
    );
  }
}
