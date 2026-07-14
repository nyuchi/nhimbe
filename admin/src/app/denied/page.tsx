/**
 * /denied — the clear access-denied screen non-admins land on.
 *
 * requireAdmin() sends every authenticated-but-unauthorised requester here
 * (suspended accounts, plain users, and role-lookup failures). It renders
 * server-side with no admin data and offers the two useful exits: back to
 * the public site, or sign out to switch accounts.
 */

import { withAuth } from "@workos-inc/authkit-nextjs";
import { ShieldX } from "lucide-react";
import { signOutAction } from "@admin/app/actions/auth";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://nhimbe.com";

export default async function DeniedPage() {
  // Best-effort: show which account was denied so admins spot a wrong-account
  // sign-in immediately. Anonymous visitors can see this page too (no gate
  // needed — it contains nothing sensitive).
  const { user } = await withAuth();

  return (
    <div className="min-h-dvh flex items-center justify-center px-6">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="mx-auto w-14 h-14 rounded-2xl bg-destructive/10 flex items-center justify-center">
          <ShieldX className="w-7 h-7 text-destructive" aria-hidden="true" />
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-bold">Access denied</h1>
          <p className="text-muted-foreground">
            This is the nhimbe admin dashboard. Your account
            {user?.email ? (
              <>
                {" "}
                (<span className="font-medium text-foreground">{user.email}</span>)
              </>
            ) : null}{" "}
            does not have the required role. If you believe this is a mistake,
            contact a platform administrator.
          </p>
        </div>
        <div className="flex items-center justify-center gap-3">
          <Button asChild variant="secondary">
            <a href={SITE_URL}>Go to nhimbe</a>
          </Button>
          {user ? (
            <form action={signOutAction}>
              <Button type="submit" variant="ghost">
                Sign out
              </Button>
            </form>
          ) : null}
        </div>
      </div>
    </div>
  );
}
