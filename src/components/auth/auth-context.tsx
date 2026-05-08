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
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const API_URL = process.env.NEXT_PUBLIC_API_URL || "https://events-api.mukoko.com";

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { user: workosUser, loading: authKitLoading, signOut: authKitSignOut } = useAuthKit();
  const { accessToken, getAccessToken } = useAccessToken();

  const [nhimbeUser, setNhimbeUser] = useState<NhimbeUser | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [hasSynced, setHasSynced] = useState(false);

  const syncWithBackend = useCallback(async () => {
    if (!workosUser) return;

    setSyncing(true);
    try {
      // Pull a fresh access token if AuthKit hasn't surfaced one yet (e.g., right after callback).
      const token = accessToken ?? (await getAccessToken().catch(() => null));
      if (!token) {
        setSyncing(false);
        return;
      }

      const email = workosUser.email ?? "";
      const name = [workosUser.firstName, workosUser.lastName].filter(Boolean).join(" ").trim();

      const response = await fetch(`${API_URL}/api/auth/sync`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          workos_user_id: workosUser.id,
          email,
          name,
        }),
      });

      if (response.ok) {
        const data = (await response.json()) as { user: NhimbeUser };
        setNhimbeUser(data.user);
      } else {
        const errData = (await response.json().catch(() => ({}))) as { error?: string; reason?: string };
        console.error("[nhimbe] auth/sync failed:", response.status, errData.reason || errData.error || "unknown");
        setNhimbeUser(null);
      }
    } catch (err) {
      console.error("[nhimbe] auth/sync network error:", err);
      setNhimbeUser(null);
    } finally {
      setSyncing(false);
      setHasSynced(true);
    }
  }, [workosUser, accessToken, getAccessToken]);

  useEffect(() => {
    if (!authKitLoading && workosUser && !hasSynced) {
      void syncWithBackend();
    }
    if (!authKitLoading && !workosUser) {
      setNhimbeUser(null);
      setHasSynced(false);
    }
  }, [authKitLoading, workosUser, hasSynced, syncWithBackend]);

  // Forward the WorkOS access token into the Supabase browser client so any
  // direct supabase.* call (Kraal, getEntitiesForPerson, etc.) authenticates
  // as the signed-in person and RLS policies that read `auth.jwt()->>sub`
  // resolve to identity.person.id.
  useEffect(() => {
    setSupabaseAccessToken(accessToken ?? null);
  }, [accessToken]);

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
    await syncWithBackend();
  }, [syncWithBackend]);

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
