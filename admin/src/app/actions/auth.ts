"use server";

/**
 * Auth server actions for the admin app. Sign-out clears the AuthKit
 * session cookie and sends the user to the WorkOS logout endpoint, landing
 * back on this app's root (which re-gates via requireAdmin).
 */

import { signOut } from "@workos-inc/authkit-nextjs";

export async function signOutAction(): Promise<void> {
  await signOut({ returnTo: "/" });
}
