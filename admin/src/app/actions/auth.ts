"use server";

/**
 * Auth server actions for the admin app. Sign-out clears the AuthKit
 * session cookie and sends the user to the WorkOS logout endpoint, landing
 * back on this app's root (which re-gates via requireAdmin).
 */

import { getSignInUrl, signOut } from "@workos-inc/authkit-nextjs";
import { redirect } from "next/navigation";
import { resolveAllowedOrgId } from "@admin/lib/workos-org";

export async function signOutAction(): Promise<void> {
  await signOut({ returnTo: "/" });
}

/**
 * Org-scoped hosted sign-in. Builds the WorkOS hosted-AuthKit URL scoped to
 * the nyuchi organization (`getSignInUrl({ organizationId })`) so the sign-in
 * screen is nyuchi-org-scoped, then redirects. When the org can't be resolved
 * this falls back to a plain sign-in — the server-side membership gate
 * (requireAdmin → requireNyuchiOrgMembership) is the real enforcement, not
 * this hint. `getSignInUrl` sets the PKCE/state cookie, which a Server Action
 * is allowed to do (an RSC render is not).
 */
export async function signInAction(): Promise<void> {
  const organizationId = (await resolveAllowedOrgId()) ?? undefined;
  const url = await getSignInUrl(
    organizationId ? { organizationId, returnTo: "/" } : { returnTo: "/" },
  );
  redirect(url);
}
