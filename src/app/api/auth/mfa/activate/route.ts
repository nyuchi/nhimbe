import { NextResponse, type NextRequest } from "next/server";
import { getWorkOS, withAuth } from "@workos-inc/authkit-nextjs";

/**
 * Confirm a freshly-enrolled authenticator factor by verifying the user's first
 * 6-digit code. We raise a fresh challenge for the factor (the one returned at
 * enroll time may have expired while the user scanned the QR) and verify the
 * code against it. `withAuth()`-gated.
 */
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const { user } = await withAuth();
  if (!user) {
    return NextResponse.json({ error: "You need to be signed in." }, { status: 401 });
  }

  let code = "";
  let factorId = "";
  try {
    const body = (await request.json()) as { code?: string; factorId?: string };
    code = body.code ?? "";
    factorId = body.factorId ?? "";
  } catch {
    /* fall through to validation */
  }

  code = code.trim();
  if (!code || !factorId) {
    return NextResponse.json({ error: "Enter the code from your authenticator app." }, { status: 400 });
  }

  try {
    const workos = getWorkOS();
    const challenge = await workos.multiFactorAuth.challengeFactor({
      authenticationFactorId: factorId,
    });
    const result = await workos.multiFactorAuth.verifyChallenge({
      authenticationChallengeId: challenge.id,
      code,
    });
    if (!result.valid) {
      return NextResponse.json({ error: "That code didn't work. Try again." }, { status: 401 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[mukoko:auth] MFA activate failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "That code didn't work. Try again." }, { status: 401 });
  }
}
