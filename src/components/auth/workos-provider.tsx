import { AuthKitProvider } from "@workos-inc/authkit-nextjs/components";
import { ReactNode } from "react";

// Deliberately NOT a server component reading the session cookie: this file
// sits in the root layout, which every route renders through, so an
// `await withAuth()` here forced the entire app dynamic — no route could ever
// be static/ISR, even ones with no auth-dependent content of their own
// (`/discover`'s `export const revalidate = 60` was a no-op because of this).
//
// Omitting `initialAuth` makes AuthKitProvider do its own client-side session
// fetch instead of skipping it — `useAuth().loading` covers that window (the
// header already renders a spinner for it, see header.tsx), so the tradeoff
// is a brief loading spinner on cold navigations rather than an instant
// avatar/sign-in icon. That's the accepted cost of getting static caching
// back on pages that don't otherwise need per-request rendering.
//
// Replaces the previous Stytch provider entirely. Stytch's vanilla-js shipped
// a bundled Preact runtime that crashed at hydration on every non-home page;
// AuthKit is pure React and has no such issue.
export function WorkOSProvider({ children }: { children: ReactNode }) {
  return <AuthKitProvider>{children}</AuthKitProvider>;
}
