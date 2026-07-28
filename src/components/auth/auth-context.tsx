"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useMemo,
  ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { useAuth as useAuthKit, useAccessToken } from "@workos-inc/authkit-nextjs/components";
import { syncCurrentUser } from "@/app/actions/auth";
import { safeReturnTo } from "@/lib/auth/return-to";

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
  /** Event-update notifications (opt-out; absent means subscribed). */
  subscribedToEventUpdates?: boolean;
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

  // Local-only dev bypass: act as a fixed Dev User without a WorkOS session.
  // Gated on NODE_ENV so it can never activate on a Vercel build (preview/prod
  // run as production). Mirrors the server-side isDevBypass() guard.
  const devBypass =
    process.env.NODE_ENV !== "production" &&
    process.env.NEXT_PUBLIC_DEV_AUTH_BYPASS === "1";

  // Server-side sync. The WorkOS session is resolved on the server via
  // AuthKit and mirrored into identity.persons (MongoDB) — the browser can't
  // reach Mongo. All data access is server-side now; there's no browser DB
  // client to seed a token into.
  const syncUser = useCallback(async () => {
    if (!workosUser && !devBypass) return;

    setSyncing(true);
    try {
      const appUser = await syncCurrentUser();
      if (appUser) {
        const fallbackName = [workosUser?.firstName, workosUser?.lastName]
          .filter(Boolean)
          .join(" ")
          .trim();
        setNhimbeUser({
          id: appUser.id,
          personId: appUser.personId,
          workosUserId: appUser.workosUserId || workosUser?.id || "",
          email: appUser.email || (workosUser?.email ?? ""),
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
  }, [workosUser, devBypass, accessToken, getAccessToken]);

  useEffect(() => {
    // Fire as soon as a WorkOS user resolves — or immediately in dev bypass,
    // where there's no WorkOS session to wait for.
    if (!authKitLoading && (workosUser || devBypass) && !hasSynced) {
      void syncUser();
    }
    if (!authKitLoading && !workosUser && !devBypass) {
      setNhimbeUser(null);
      setHasSynced(false);
    }
  }, [authKitLoading, workosUser, devBypass, hasSynced, syncUser]);

  const signIn = useCallback(
    (returnUrl?: string) => {
      // Hand the deep-link straight to the hosted AuthKit entry as a query
      // param — the route re-clamps it and WorkOS round-trips it back through
      // /callback. safeReturnTo guards against open redirects.
      const returnTo = safeReturnTo(returnUrl);
      router.push(`/auth/hosted?return_to=${encodeURIComponent(returnTo)}`);
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

  // Stay "loading" until the first identity sync resolves when a user is
  // expected (WorkOS session or dev bypass). Without this, there's a tick
  // where authKitLoading is already false but the sync hasn't set nhimbeUser
  // yet — AuthGuard would briefly see "not authenticated" and bounce a
  // genuinely signed-in user out to the hosted AuthKit UI.
  const isLoading =
    authKitLoading || syncing || ((!!workosUser || devBypass) && !hasSynced);
  const isAuthenticated = (!!workosUser || devBypass) && !!nhimbeUser;

  const hasName = !!nhimbeUser?.name && nhimbeUser.name !== "" && nhimbeUser.name !== "User";
  const hasAddressLocality = !!nhimbeUser?.addressLocality;
  const hasInterests = !!nhimbeUser?.interests && nhimbeUser.interests.length > 0;

  const getAccessTokenSafe = useCallback(async () => {
    try {
      const t = await getAccessToken();
      return t ?? null;
    } catch {
      return null;
    }
  }, [getAccessToken]);

  // Memoise the context value so useAuth consumers don't re-render on every
  // AuthProvider render. Previously the value was a fresh object literal each
  // render, so the whole subscribed tree (header, guards, every page using
  // useAuth) re-rendered even when nothing auth-related changed — a systemic
  // churn source behind sluggish navigation. Every callback here is useCallback-
  // stable, so the memo only changes when real auth state changes.
  const value = useMemo<AuthContextType>(
    () => ({
      user: nhimbeUser,
      isAuthenticated,
      isLoading,
      profileCompleteness: {
        name: hasName,
        addressLocality: hasAddressLocality,
        interests: hasInterests,
        complete: hasName && hasAddressLocality && hasInterests,
      },
      signIn,
      signOut,
      refreshUser,
      accessToken: accessToken ?? null,
      getAccessToken: getAccessTokenSafe,
    }),
    [
      nhimbeUser,
      isAuthenticated,
      isLoading,
      hasName,
      hasAddressLocality,
      hasInterests,
      signIn,
      signOut,
      refreshUser,
      accessToken,
      getAccessTokenSafe,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
