"use server";

/**
 * Auth server actions.
 *
 * `syncCurrentUser` resolves the signed-in WorkOS session server-side (via
 * AuthKit's `withAuth()` — no access token is passed from the client) and
 * mirrors the user into `identity.persons`. This replaces the previous
 * browser-side Supabase upsert (`upsertPersonFromWorkos`): the browser can't
 * talk to MongoDB, so the sync now runs on Vercel's server runtime.
 */

import { withAuth } from "@workos-inc/authkit-nextjs";
import { syncPersonFromWorkos, type AppUser } from "@/lib/mongo/users";
import { isDevBypass, DEV_WORKOS_ID, DEV_EMAIL, DEV_NAME } from "@/lib/auth/dev";

/**
 * Sync the currently signed-in user into identity.persons and return the app
 * user. Returns null when there is no session, or when the account is
 * suspended (`isActive === false`) — the client then treats the user as
 * signed out, matching the worker's old 403 `account_suspended` behaviour.
 */
export async function syncCurrentUser(): Promise<AppUser | null> {
  try {
    // Local-only bypass: act as a fixed Dev User without the WorkOS round-trip.
    if (isDevBypass()) {
      return await syncPersonFromWorkos({
        workosUserId: DEV_WORKOS_ID,
        email: DEV_EMAIL,
        name: DEV_NAME,
        emailVerified: true,
      });
    }

    const { user } = await withAuth();
    if (!user) return null;

    const name = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();

    const appUser = await syncPersonFromWorkos({
      workosUserId: user.id,
      email: user.email ?? null,
      name: name || null,
      givenName: user.firstName ?? null,
      familyName: user.lastName ?? null,
      picture: user.profilePictureUrl ?? null,
      emailVerified: user.emailVerified ?? undefined,
    });

    if (appUser.suspended) return null;
    return appUser;
  } catch (err) {
    // Any failure — withAuth() throwing because the AuthKit proxy didn't run
    // (incomplete WorkOS env), or the Mongo upsert failing (e.g. MONGODB_URI
    // unset on a preview) — degrades to signed-out instead of 500-ing the
    // caller. A misconfigured deployment renders as logged-out, not crashed.
    console.error("[mukoko:auth] syncCurrentUser failed; treating as signed out:", err);
    return null;
  }
}
