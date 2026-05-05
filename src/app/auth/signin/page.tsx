import { redirect } from "next/navigation";
import { getSignInUrl } from "@workos-inc/authkit-nextjs";

interface SignInPageProps {
  searchParams: Promise<{ return_to?: string }>;
}

// Server-side redirect to WorkOS AuthKit's hosted sign-in UI. AuthKit owns
// the actual login form (email + magic link, OAuth providers, etc.) and
// redirects back to /callback once the user is authenticated. We keep this
// route for backwards-compatibility with internal links to /auth/signin.
export default async function SignInPage({ searchParams }: SignInPageProps) {
  const { return_to } = await searchParams;
  const url = await getSignInUrl({
    returnTo: return_to && return_to.startsWith("/") && !return_to.startsWith("//") ? return_to : "/",
  });
  redirect(url);
}
