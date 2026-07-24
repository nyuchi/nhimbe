"use server";

/**
 * Auth server actions for the admin app. Sign-out clears the AuthKit
 * session cookie and sends the user to the WorkOS logout endpoint, landing
 * back on this app's root (which re-gates via requireAdmin).
 */

import { getSignInUrl, signOut } from "@workos-inc/authkit-nextjs";
import { redirect } from "next/navigation";

export async function signOutAction(): Promise<void> {
  await signOut({ returnTo: "/" });
}

/**
 * Hosted sign-in, optionally org-scoped. When `WORKOS_ADMIN_ORG_ID` is set
 * the WorkOS hosted-AuthKit URL is scoped to it (`getSignInUrl({
 * organizationId })`) so the sign-in screen is nyuchi-org-scoped — a pure UX
 * hint, no WorkOS API lookup. The real enforcement is the server-side
 * membership gate (requireAdmin → requireNyuchiMembership over
 * `entity.memberships`). `getSignInUrl` sets the PKCE/state cookie, which a
 * Server Action is allowed to do (an RSC render is not).
 */
export async function signInAction(): Promise<void> {
  const organizationId = process.env.WORKOS_ADMIN_ORG_ID?.trim() || undefined;
  const url = await getSignInUrl(
    organizationId ? { organizationId, returnTo: "/" } : { returnTo: "/" },
  );
  redirect(url);
}
