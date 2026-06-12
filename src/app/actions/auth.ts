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

/**
 * Sync the currently signed-in user into identity.persons and return the app
 * user. Returns null when there is no session, or when the account is
 * suspended (`isActive === false`) — the client then treats the user as
 * signed out, matching the worker's old 403 `account_suspended` behaviour.
 */
export async function syncCurrentUser(): Promise<AppUser | null> {
  let user: Awaited<ReturnType<typeof withAuth>>["user"];
  try {
    ({ user } = await withAuth());
  } catch (err) {
    // withAuth() throws if the AuthKit proxy didn't run for this request —
    // e.g. WorkOS env is incomplete on the deployment, or the proxy isn't
    // intercepting. Degrade to signed-out instead of 500-ing the caller, so a
    // misconfigured deployment renders as logged-out rather than crashing.
    console.error("[mukoko:auth] withAuth() failed; treating as signed out:", err);
    return null;
  }
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
}
