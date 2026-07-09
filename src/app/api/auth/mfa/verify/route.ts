import { NextResponse, type NextRequest } from "next/server";
import { getWorkOS, saveSession } from "@workos-inc/authkit-nextjs";

/**
 * MFA step-up completion: exchange a short-lived `pendingAuthenticationToken`
 * (handed back by the email-code or password route when the account has TOTP
 * enabled) plus the 6-digit authenticator code for a full session.
 *
 * The pending token is single-use and never persisted — the client only holds
 * it between the sign-in step and this call.
 */
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  let code = "";
  let pendingAuthenticationToken = "";
  let challengeId = "";
  try {
    const body = (await request.json()) as {
      code?: string;
      pendingAuthenticationToken?: string;
      challengeId?: string;
    };
    code = body.code ?? "";
    pendingAuthenticationToken = body.pendingAuthenticationToken ?? "";
    challengeId = body.challengeId ?? "";
  } catch {
    /* fall through to validation */
  }

  code = code.trim();
  if (!code || !pendingAuthenticationToken) {
    return NextResponse.json({ error: "Enter the code from your authenticator app." }, { status: 400 });
  }

  const clientId = process.env.WORKOS_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json(
      { error: "Sign-in isn't configured on this deployment." },
      { status: 503 },
    );
  }

  try {
    const auth = await getWorkOS().userManagement.authenticateWithTotp({
      clientId,
      code,
      pendingAuthenticationToken,
      authenticationChallengeId: challengeId,
    });
    // Persist the encrypted WorkOS session cookie. AuthProvider then syncs the
    // user into identity.persons on the next render.
    await saveSession(auth, request);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[mukoko:auth] authenticateWithTotp failed:", err);
    return NextResponse.json(
      { error: "That code didn't work. Try again." },
      { status: 401 },
    );
  }
}
