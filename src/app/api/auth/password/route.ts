import { NextResponse, type NextRequest } from "next/server";
import { getWorkOS, saveSession } from "@workos-inc/authkit-nextjs";
import { mfaChallengeFromError } from "@/lib/auth/mfa";

/**
 * Self-hosted password sign-in: authenticate an email + password against the
 * WorkOS headless User Management API and create the session cookie in-app (no
 * redirect to a hosted UI).
 *
 * saveSession needs a request object, which is why this is a Route Handler
 * rather than a Server Action.
 */
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  let email = "";
  let password = "";
  try {
    const body = (await request.json()) as { email?: string; password?: string };
    email = body.email ?? "";
    password = body.password ?? "";
  } catch {
    /* fall through to validation */
  }

  email = email.trim().toLowerCase();
  if (!email || !password) {
    return NextResponse.json(
      { error: "Enter your email and password." },
      { status: 400 },
    );
  }

  const clientId = process.env.WORKOS_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json(
      { error: "Sign-in isn't configured on this deployment." },
      { status: 503 },
    );
  }

  try {
    const auth = await getWorkOS().userManagement.authenticateWithPassword({
      clientId,
      email,
      password,
    });
    // Persist the encrypted WorkOS session cookie. AuthProvider then syncs the
    // user into identity.persons on the next render.
    await saveSession(auth, request);
    return NextResponse.json({ ok: true });
  } catch (err) {
    // The password was correct but the account has TOTP enabled: WorkOS throws
    // an "mfa_challenge" signal carrying a one-time pending token. Hand that to
    // the client so it can collect the 6-digit code — not a credential failure.
    const mfa = mfaChallengeFromError(err);
    if (mfa) {
      return NextResponse.json({
        mfa: true,
        pendingAuthenticationToken: mfa.pendingAuthenticationToken,
        challengeId: mfa.challengeId,
      });
    }
    // Never leak the raw WorkOS error — a generic message avoids revealing
    // whether the email exists.
    console.error("[mukoko:auth] authenticateWithPassword failed:", err);
    return NextResponse.json(
      { error: "That email or password is incorrect." },
      { status: 401 },
    );
  }
}
