import { redirect } from "next/navigation";

// Legacy Stytch callback path. Old magic-link emails may still point here.
// Forward to the home page; AuthKit's /callback route is now the canonical
// post-auth landing target.
export default function AuthenticatePage() {
  redirect("/");
}
