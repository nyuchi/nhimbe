import { NextResponse, type NextRequest } from "next/server";
import { getWorkOS } from "@workos-inc/authkit-nextjs";

/**
 * Step 1 of the embedded (in-app) sign-in: email a one-time Magic Auth code.
 *
 * Runs as a Route Handler — cookie/SDK work that the embedded form triggers
 * lives here, never in an RSC render.
 */
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  let email = "";
  try {
    const body = (await request.json()) as { email?: string };
    email = body.email ?? "";
  } catch {
    /* fall through to validation */
  }

  email = email.trim().toLowerCase();
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }

  try {
    await getWorkOS().userManagement.createMagicAuth({ email });
    return NextResponse.json({ sent: true });
  } catch (err) {
    console.error("[mukoko:auth] createMagicAuth failed:", err);
    return NextResponse.json(
      { error: "We couldn't send a sign-in code. Please try again." },
      { status: 502 },
    );
  }
}
