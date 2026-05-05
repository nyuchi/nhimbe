import { handleAuth } from "@workos-inc/authkit-nextjs";

// AuthKit redirects users here after completing sign-in. handleAuth swaps
// the authorization code for a session, sets the secure session cookie,
// and redirects to the returnPathname (or "/" by default).
export const GET = handleAuth({
  returnPathname: "/",
});
