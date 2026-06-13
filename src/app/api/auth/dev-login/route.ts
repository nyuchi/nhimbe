import { NextResponse } from "next/server";
import { isDevBypass, DEV_WORKOS_ID, DEV_EMAIL, DEV_NAME } from "@/lib/auth/dev";
import { syncPersonFromWorkos } from "@/lib/mongo/users";

/**
 * Dev-only convenience: upsert the local "Dev User" into identity.persons and
 * return it. Returns 404 unless the dev bypass is active (local next dev with
 * DEV_AUTH_BYPASS=1) — so it can never do anything on a deployed environment.
 */
export const runtime = "nodejs";

export async function GET() {
  if (!isDevBypass()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  try {
    const user = await syncPersonFromWorkos({
      workosUserId: DEV_WORKOS_ID,
      email: DEV_EMAIL,
      name: DEV_NAME,
      emailVerified: true,
    });
    return NextResponse.json({ ok: true, user });
  } catch (err) {
    console.error("[mukoko:auth] dev-login failed:", err);
    return NextResponse.json({ error: "dev-login failed" }, { status: 500 });
  }
}
