import { authkitProxy } from "@workos-inc/authkit-nextjs";

// Next.js 16+ proxy (was middleware in <=15). AuthKit uses this for session
// cookie management on the routes that need a logged-in user. Pages that
// don't appear in the matcher are still publicly viewable; AuthKit only
// touches them via withAuth() / useAuth() on demand.
export default authkitProxy();

export const config = {
  // Run on every page-style route, but skip Next's static / image / favicon
  // pipelines so Tailwind v4 + image optimisation aren't intercepted.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|sw.js|manifest.json|.*\\..*).*)"],
};
