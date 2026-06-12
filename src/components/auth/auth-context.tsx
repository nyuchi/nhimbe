"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { useAuth as useAuthKit, useAccessToken } from "@workos-inc/authkit-nextjs/components";
import { setSupabaseAccessToken } from "@/lib/supabase/client";
import { syncCurrentUser } from "@/app/actions/auth";

export type UserRole = "user" | "moderator" | "admin" | "super_admin";

export interface NhimbeUser {
  id: string;
  email: string;
  name: string;
  image?: string;
  addressLocality?: string;
  addressCountry?: string;
  interests?: string[];
  // schema.org Person UUID from identity.person — this is what auth.uid() returns under our platform JWT.
  personId: string;
  // WorkOS user id (kept for audit / migration). Replaces the old stytchUserId field.
  workosUserId: string;
  role: UserRole;
}

export interface ProfileCompleteness {
  name: boolean;
  addressLocality: boolean;
  interests: boolean;
  complete: boolean;
}

const ROLE_HIERARCHY: Record<UserRole, number> = {
  user: 0,
  moderator: 1,
  admin: 2,
  super_admin: 3,
};

export function hasPermission(userRole: UserRole, requiredRole: UserRole): boolean {
  return ROLE_HIERARCHY[userRole] >= ROLE_HIERARCHY[requiredRole];
}

interface AuthContextType {
  user: NhimbeUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  profileCompleteness: ProfileCompleteness;
  signIn: (returnUrl?: string) => void;
  signOut: () => Promise<void>;
  refreshUser: () => Promise<void>;
  /**
   * Current WorkOS access token (JWT) or null if the user is signed out.
   * Pass this as the `sessionJwt` argument to every write helper in
   * `src/lib/api.ts` — the worker validates it locally against WorkOS's
   * JWKS and uses the `sub` claim to derive the actor identity.
   *
   * Snapshot of `useAccessToken().accessToken` from
   * `@workos-inc/authkit-nextjs/components`. AuthKit refreshes this in the
   * background, so reading it at call time is safe.
   */
  accessToken: string | null;
  /**
   * Force-refresh and return the current access token. Useful when a long-
   * lived screen needs to make a write after sitting idle — call this
   * immediately before the write to avoid sending an expired JWT.
   */
  getAccessToken: () => Promise<string | null>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { user: workosUser, loading: authKitLoading, signOut: authKitSignOut } = useAuthKit();
  const { accessToken, getAccessToken } = useAccessToken();

  const [nhimbeUser, setNhimbeUser] = useState<NhimbeUser | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [hasSynced, setHasSynced] = useState(false);

  // Forward the WorkOS access token into the Supabase browser client so
  // every direct supabase.* call authenticates as the signed-in person and
  // RLS that reads auth.jwt()->>sub resolves to identity.person.id.
  useEffect(() => {
    setSupabaseAccessToken(accessToken ?? null);
  }, [accessToken]);

  // Server-side sync. The WorkOS session is resolved on the server via
  // AuthKit and mirrored into identity.persons (MongoDB) — the browser can't
  // reach Mongo. We still forward the access token to the Supabase client for
  // the read paths not yet migrated off direct Supabase access.
  const syncUser = useCallback(async () => {
    if (!workosUser) return;

    setSyncing(true);
    try {
      const token = accessToken ?? (await getAccessToken().catch(() => null));
      if (token) setSupabaseAccessToken(token);

      const appUser = await syncCurrentUser();
      if (appUser) {
        const fallbackName = [workosUser.firstName, workosUser.lastName]
          .filter(Boolean)
          .join(" ")
          .trim();
        setNhimbeUser({
          id: appUser.id,
          personId: appUser.personId,
          workosUserId: appUser.workosUserId || workosUser.id,
          email: appUser.email || (workosUser.email ?? ""),
          name: appUser.name || fallbackName,
          image: appUser.image,
          addressLocality: appUser.addressLocality,
          addressCountry: appUser.addressCountry,
          interests: appUser.interests,
          role: appUser.role,
        });
      } else {
        // No session or suspended account — treat as signed out.
        setNhimbeUser(null);
      }
    } catch (err) {
      console.error("[nhimbe] identity.persons sync failed:", err);
      setNhimbeUser(null);
    } finally {
      setSyncing(false);
      setHasSynced(true);
    }
  }, [workosUser, accessToken, getAccessToken]);

  useEffect(() => {
    // The server action reads the session cookie, so the sync no longer waits
    // on the client access token — fire as soon as the WorkOS user resolves.
    if (!authKitLoading && workosUser && !hasSynced) {
      void syncUser();
    }
    if (!authKitLoading && !workosUser) {
      setNhimbeUser(null);
      setHasSynced(false);
    }
  }, [authKitLoading, workosUser, hasSynced, syncUser]);

  const signIn = useCallback(
    (returnUrl?: string) => {
      if (returnUrl && typeof window !== "undefined") {
        const isRelativePath = returnUrl.startsWith("/") && !returnUrl.startsWith("//");
        if (isRelativePath) {
          localStorage.setItem("auth_redirect", returnUrl);
        }
      }
      router.push("/auth/signin");
    },
    [router],
  );

  const signOut = useCallback(async () => {
    try {
      await authKitSignOut({ returnTo: "/" });
    } catch {
      // AuthKit will redirect on success; if the call throws (offline etc.) we still want
      // to clear local state.
    } finally {
      setNhimbeUser(null);
      setHasSynced(false);
    }
  }, [authKitSignOut]);

  const refreshUser = useCallback(async () => {
    setHasSynced(false);
    await syncUser();
  }, [syncUser]);

  const isLoading = authKitLoading || syncing;
  const isAuthenticated = !!workosUser && !!nhimbeUser;

  const hasName = !!nhimbeUser?.name && nhimbeUser.name !== "" && nhimbeUser.name !== "User";
  const hasAddressLocality = !!nhimbeUser?.addressLocality;
  const hasInterests = !!nhimbeUser?.interests && nhimbeUser.interests.length > 0;

  const profileCompleteness: ProfileCompleteness = {
    name: hasName,
    addressLocality: hasAddressLocality,
    interests: hasInterests,
    complete: hasName && hasAddressLocality && hasInterests,
  };

  const getAccessTokenSafe = useCallback(async () => {
    try {
      const t = await getAccessToken();
      return t ?? null;
    } catch {
      return null;
    }
  }, [getAccessToken]);

  return (
    <AuthContext.Provider
      value={{
        user: nhimbeUser,
        isAuthenticated,
        isLoading,
        profileCompleteness,
        signIn,
        signOut,
        refreshUser,
        accessToken: accessToken ?? null,
        getAccessToken: getAccessTokenSafe,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
