import { NextResponse, type NextRequest } from "next/server";
import { getSignInUrl } from "@workos-inc/authkit-nextjs";

/**
 * Fallback: redirect to WorkOS's hosted AuthKit sign-in UI.
 *
 * The primary sign-in is the embedded form at /auth/signin; this stays as a
 * safety net (and for SSO/social flows the embedded passwordless form doesn't
 * cover). It's a Route Handler because getSignInUrl() writes PKCE/state
 * cookies, which RSC render forbids.
 */
export async function GET(request: NextRequest) {
  const returnToRaw = request.nextUrl.searchParams.get("return_to") ?? "/";
  const returnTo =
    returnToRaw.startsWith("/") && !returnToRaw.startsWith("//") ? returnToRaw : "/";

  try {
    const url = await getSignInUrl({ returnTo });
    return NextResponse.redirect(url);
  } catch (err) {
    console.error("[mukoko:auth] getSignInUrl failed:", err);
    return new NextResponse(
      "Sign-in is not available on this deployment (WorkOS configuration missing).",
      { status: 503 },
    );
  }
}
