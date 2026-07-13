import { NextResponse, type NextRequest } from "next/server";
import { getSignInUrl, getSignUpUrl } from "@workos-inc/authkit-nextjs";
import { safeReturnTo } from "@/lib/auth/return-to";

/**
 * Primary auth entry point: redirect to WorkOS's hosted AuthKit UI.
 *
 * nhimbe no longer ships a self-hosted sign-in form — every "Sign in" / "Sign
 * up" affordance links here. WorkOS's hosted page handles email codes,
 * passwords, MFA, passkeys and social natively; the user comes back to
 * `/callback` (`handleAuth`) which exchanges the code for a session.
 *
 * This is a Route Handler (not an RSC) because `getSignInUrl()` /
 * `getSignUpUrl()` write PKCE/state cookies, which RSC render forbids.
 *
 * Query params:
 *   - `return_to` — deep-link to send the user back to after login. Clamped to
 *     a same-origin absolute path (`safeReturnTo`) so it can never be an open
 *     redirect.
 *   - `screen=sign-up` — start on the hosted sign-up screen instead of sign-in.
 */
export async function GET(request: NextRequest) {
  const returnTo = safeReturnTo(request.nextUrl.searchParams.get("return_to"));
  const wantsSignUp = request.nextUrl.searchParams.get("screen") === "sign-up";

  try {
    const url = wantsSignUp
      ? await getSignUpUrl({ returnTo })
      : await getSignInUrl({ returnTo });
    return NextResponse.redirect(url);
  } catch (err) {
    console.error("[mukoko:auth] hosted AuthKit URL build failed:", err);
    return new NextResponse(
      "Sign-in is not available on this deployment (WorkOS configuration missing).",
      { status: 503 },
    );
  }
}
