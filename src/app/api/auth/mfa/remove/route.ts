import { NextResponse, type NextRequest } from "next/server";
import { getWorkOS, withAuth } from "@workos-inc/authkit-nextjs";

/**
 * Delete an authenticator (TOTP) factor for the signed-in user.
 *
 * Used when a user backs out of enrollment ("Skip for now") so we never leave
 * an orphaned, unverified factor on the account — orphaned factors are exactly
 * what forces a phantom MFA challenge at sign-in. `withAuth()`-gated; the
 * `factorId` is the one this user just received from `/api/auth/mfa/enroll`.
 */
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const { user } = await withAuth();
  if (!user) {
    return NextResponse.json({ error: "You need to be signed in." }, { status: 401 });
  }

  let factorId = "";
  try {
    const body = (await request.json()) as { factorId?: string };
    factorId = body.factorId ?? "";
  } catch {
    /* fall through to validation */
  }
  if (!factorId) {
    return NextResponse.json({ error: "Missing factor id." }, { status: 400 });
  }

  try {
    const workos = getWorkOS();
    // Ownership check: only delete a factor that belongs to THIS user. deleteFactor
    // is environment-scoped, so without this a signed-in user could delete anyone's
    // factor (disable their MFA) by id.
    const factors = await workos.multiFactorAuth.listUserAuthFactors({ userId: user.id });
    if (!factors.data.some((f) => f.id === factorId)) {
      return NextResponse.json({ error: "Factor not found." }, { status: 404 });
    }
    await workos.multiFactorAuth.deleteFactor(factorId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[mukoko:auth] MFA remove failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Couldn't remove the factor." }, { status: 502 });
  }
}
