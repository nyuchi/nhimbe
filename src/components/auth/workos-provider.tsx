import { AuthKitProvider } from "@workos-inc/authkit-nextjs/components";
import { withAuth } from "@workos-inc/authkit-nextjs";
import { ReactNode } from "react";

// Server component that prefetches the auth state from the WorkOS session
// cookie and seeds AuthKitProvider with it. This avoids the loading flash
// on hydration and keeps the access token off the client (we strip it).
//
// Replaces the previous Stytch provider entirely. Stytch's vanilla-js
// shipped a bundled Preact runtime that crashed at hydration on every
// non-home page; AuthKit is pure React and has no such issue.
export async function WorkOSProvider({ children }: { children: ReactNode }) {
  let initialAuth: Parameters<typeof AuthKitProvider>[0]["initialAuth"];
  try {
    const auth = await withAuth();
    // Strip the access token — never expose to the client tree.
    const { accessToken: _accessToken, ...rest } = auth;
    void _accessToken;
    initialAuth = rest;
  } catch {
    // No session / not configured yet: render as logged-out. AuthKit handles
    // the loading state and refresh on its own.
    initialAuth = undefined;
  }

  return <AuthKitProvider initialAuth={initialAuth}>{children}</AuthKitProvider>;
}
