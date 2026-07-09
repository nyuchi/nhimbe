import { NextResponse, type NextRequest } from "next/server";
import { ssoAuthUrlForEmail } from "@/lib/auth/flows";

/**
 * Self-hosted organization SSO start on the WorkOS headless API. The client
 * posts a work email; we resolve its domain to a WorkOS organization and hand
 * back the authorization URL for the browser to follow. WorkOS returns the
 * user to `/callback`, which exchanges the code for a session.
 */
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  let email = "";
  let returnTo = "/";
  try {
    const body = (await request.json()) as { email?: string; return_to?: string };
    email = body.email ?? "";
    returnTo = body.return_to ?? "/";
  } catch {
    /* fall through to validation */
  }

  const result = await ssoAuthUrlForEmail(email, returnTo);
  switch (result.status) {
    case "ok":
      return NextResponse.json({ url: result.url });
    case "invalid-email":
      return NextResponse.json({ error: "Enter a valid work email address." }, { status: 400 });
    case "config":
      return NextResponse.json(
        { error: "Sign-in isn't configured on this deployment." },
        { status: 503 },
      );
    case "not-found":
      return NextResponse.json(
        { error: "No SSO configured for that domain. Try email code or a social login." },
        { status: 404 },
      );
    case "error":
      return NextResponse.json(
        { error: "We couldn't start SSO sign-in. Please try again." },
        { status: 502 },
      );
  }
}
