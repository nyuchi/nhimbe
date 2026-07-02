import { NextResponse, type NextRequest } from "next/server";
import { getWorkOS, saveSession } from "@workos-inc/authkit-nextjs";

/**
 * Step 2 of the embedded sign-in: verify the Magic Auth code and create the
 * WorkOS session cookie in-app (no redirect to the hosted UI).
 *
 * saveSession needs a request object, which is why this is a Route Handler
 * rather than a Server Action.
 */
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  let email = "";
  let code = "";
  try {
    const body = (await request.json()) as { email?: string; code?: string };
    email = body.email ?? "";
    code = body.code ?? "";
  } catch {
    /* fall through to validation */
  }

  email = email.trim().toLowerCase();
  code = code.trim();
  if (!email || !code) {
    return NextResponse.json({ error: "Enter the code we emailed you." }, { status: 400 });
  }

  const clientId = process.env.WORKOS_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json(
      { error: "Sign-in isn't configured on this deployment." },
      { status: 503 },
    );
  }

  try {
    const auth = await getWorkOS().userManagement.authenticateWithMagicAuth({
      clientId,
      code,
      email,
    });
    // Persist the encrypted WorkOS session cookie. AuthProvider then syncs the
    // user into identity.persons on the next render.
    await saveSession(auth, request);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[mukoko:auth] authenticateWithMagicAuth failed:", err);
    return NextResponse.json(
      { error: "That code didn't work or has expired. Request a new one." },
      { status: 401 },
    );
  }
}
