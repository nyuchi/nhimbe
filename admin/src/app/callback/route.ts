import { handleAuth } from "@workos-inc/authkit-nextjs";

// WorkOS hosted AuthKit redirects here after sign-in (this app's own
// NEXT_PUBLIC_WORKOS_REDIRECT_URI — e.g. https://admin.nhimbe.com/callback —
// registered in the same WorkOS environment as the public app). handleAuth
// swaps the authorization code for a session, sets the encrypted session
// cookie, and returns to the originally requested admin path (or the
// overview by default).
export const GET = handleAuth({
  returnPathname: "/",
});
