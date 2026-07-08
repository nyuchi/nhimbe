import { NextResponse } from "next/server";
import { getWorkOS, withAuth } from "@workos-inc/authkit-nextjs";

/**
 * Begin authenticator-app (TOTP) enrollment for the signed-in user. Returns the
 * QR code (data URI) and the manual-entry secret for the UI to display, plus the
 * factor + challenge ids the activation step needs. `withAuth()`-gated: the user
 * must already have a session.
 *
 * The secret is returned to the browser for setup but is NEVER logged here.
 */
export const runtime = "nodejs";

export async function POST() {
  const { user } = await withAuth();
  if (!user) {
    return NextResponse.json({ error: "You need to be signed in." }, { status: 401 });
  }

  try {
    const { authenticationFactor, authenticationChallenge } =
      await getWorkOS().multiFactorAuth.createUserAuthFactor({
        userId: user.id,
        type: "totp",
        totpIssuer: "nhimbe",
        totpUser: user.email ?? user.id,
      });

    return NextResponse.json({
      factorId: authenticationFactor.id,
      challengeId: authenticationChallenge.id,
      qrCode: authenticationFactor.totp.qrCode,
      secret: authenticationFactor.totp.secret,
    });
  } catch (err) {
    // Log without the response body so the TOTP secret can't leak into logs.
    console.error("[mukoko:auth] MFA enroll failed:", err instanceof Error ? err.message : err);
    return NextResponse.json(
      { error: "Two-factor isn't available yet." },
      { status: 503 },
    );
  }
}
