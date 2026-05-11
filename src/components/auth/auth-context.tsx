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
import { upsertPersonFromWorkos } from "@/lib/supabase/api";
import type { PersonRow } from "@/lib/supabase/types";

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

function personRowToNhimbeUser(row: PersonRow, fallbackEmail: string, fallbackName: string): NhimbeUser {
  const role = (row.role ?? "user") as UserRole;
  return {
    id: row.id,
    personId: row.id,
    workosUserId: row.workos_user_id ?? "",
    email: row.email ?? fallbackEmail,
    name: row.name ?? fallbackName,
    image: row.image ?? undefined,
    addressLocality: row.address?.addressLocality ?? undefined,
    addressCountry: row.address?.addressCountry ?? undefined,
    interests: row.knowsabout ?? [],
    role: ROLE_HIERARCHY[role] !== undefined ? role : "user",
  };
}

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

  // Supabase-direct sync. Replaces the old worker /api/auth/sync round-trip
  // — identity.person now owns the canonical user state.
  const syncWithSupabase = useCallback(async () => {
    if (!workosUser) return;

    setSyncing(true);
    try {
      // Make sure the access token is in the Supabase client before the
      // upsert hits PostgREST; useEffect above is async w.r.t. this call.
      const token = accessToken ?? (await getAccessToken().catch(() => null));
      if (token) setSupabaseAccessToken(token);
      if (!token) {
        setSyncing(false);
        return;
      }

      const email = workosUser.email ?? "";
      const name = [workosUser.firstName, workosUser.lastName].filter(Boolean).join(" ").trim();

      const row = await upsertPersonFromWorkos({
        workosUserId: workosUser.id,
        email,
        name,
        givenname: workosUser.firstName ?? null,
        familyname: workosUser.lastName ?? null,
      });

      if (row) {
        setNhimbeUser(personRowToNhimbeUser(row, email, name));
      } else {
        console.error("[nhimbe] identity.person upsert returned null");
        setNhimbeUser(null);
      }
    } catch (err) {
      console.error("[nhimbe] identity.person sync failed:", err);
      setNhimbeUser(null);
    } finally {
      setSyncing(false);
      setHasSynced(true);
    }
  }, [workosUser, accessToken, getAccessToken]);

  useEffect(() => {
    if (!authKitLoading && workosUser && !hasSynced) {
      void syncWithSupabase();
    }
    if (!authKitLoading && !workosUser) {
      setNhimbeUser(null);
      setHasSynced(false);
    }
  }, [authKitLoading, workosUser, hasSynced, syncWithSupabase]);

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
    await syncWithSupabase();
  }, [syncWithSupabase]);

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
