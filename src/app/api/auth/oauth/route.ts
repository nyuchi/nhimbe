import { NextResponse, type NextRequest } from "next/server";
import { isProvider, safeReturnTo, socialAuthUrl } from "@/lib/auth/flows";

/**
 * Self-hosted social OAuth start (Google, Microsoft) on the WorkOS headless
 * API. We build the authorization URL and 302 the browser to WorkOS; the
 * provider sends the user back to `/callback`, which exchanges the code for a
 * session. No hosted WorkOS UI is involved.
 */
export const runtime = "nodejs";

export function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const provider = searchParams.get("provider");
  const returnTo = safeReturnTo(searchParams.get("return_to"));

  if (!provider || !isProvider(provider)) {
    return NextResponse.json({ error: "Unsupported sign-in provider." }, { status: 400 });
  }

  const url = socialAuthUrl(provider, returnTo);
  if (!url) {
    // Missing WorkOS env — fail soft to the sign-in page rather than 500.
    return NextResponse.redirect(new URL("/auth/signin?error=config", request.url));
  }
  return NextResponse.redirect(url);
}
