"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth, hasPermission, type UserRole } from "./auth-context";
import { Loader2, ShieldAlert } from "lucide-react";

interface AuthGuardProps {
  children: React.ReactNode;
  /**
   * If supplied, the signed-in user must hold this role (or higher) to render
   * `children`. Users without the role see a "not authorized" placeholder
   * instead of being redirected to sign-in, so that signed-in users on the
   * wrong account don't get into a redirect loop.
   */
  requiredRole?: UserRole;
}

export function AuthGuard({ children, requiredRole }: AuthGuardProps) {
  const { isAuthenticated, isLoading, user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      // Send the user to the hosted AuthKit UI, deep-linking back to the
      // guarded page after login.
      router.push(`/auth/hosted?return_to=${encodeURIComponent(pathname)}`);
    }
  }, [isAuthenticated, isLoading, pathname, router]);

  if (isLoading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  if (requiredRole && (!user || !hasPermission(user.role, requiredRole))) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center text-center px-6">
        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-500/10 flex items-center justify-center">
          <ShieldAlert className="w-8 h-8 text-red-400" />
        </div>
        <h1 className="text-2xl font-bold mb-2">Not authorized</h1>
        <p className="text-text-secondary max-w-md">
          You do not have permission to view this page.
        </p>
      </div>
    );
  }

  return <>{children}</>;
}
