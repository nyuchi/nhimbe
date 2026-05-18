/**
 * Browser Supabase client for the nyuchi_platform_db.
 *
 * The WorkOS session is the source of truth — the access token from
 * `useAccessToken()` is forwarded as the Authorization header on every
 * Supabase request, so RLS policies that read `auth.jwt()` see the same
 * `sub` (= person_id) the worker sees. Schemas are accessed via
 * `supabase.schema('events' | 'circles' | 'identity' | 'places' | …)`.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Guard against accidental server imports. The browser client wires its
// fetch to a module-level `accessToken` that's only ever set by the
// client-side auth provider — using it from an RSC or route handler would
// silently send unauthenticated requests. Today this is held safe only by
// the "use client" boundary in auth-context; the throw makes it future-proof.
// (`src/lib/supabase/server.ts` is the correct module on the server.)
if (typeof window === "undefined") {
  throw new Error(
    "[nhimbe] src/lib/supabase/client.ts was imported from a server context. " +
      "Use src/lib/supabase/server.ts in RSC / route handlers instead.",
  );
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

let cached: SupabaseClient | null = null;

// Module-level token holder. Updated by setSupabaseAccessToken() from the
// auth-context provider so subsequent Supabase calls authenticate as the
// signed-in person without re-creating the client.
let accessToken: string | null = null;

export function setSupabaseAccessToken(token: string | null): void {
  accessToken = token;
}

export function getSupabaseBrowserClient(): SupabaseClient {
  if (cached) return cached;
  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
    throw new Error(
      "[mukoko] Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    );
  }
  cached = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      storageKey: "nhimbe.supabase.auth",
    },
    global: {
      headers: { "x-client-info": "nhimbe-web" },
      fetch: (input, init) => {
        const headers = new Headers(init?.headers);
        if (accessToken) {
          headers.set("Authorization", `Bearer ${accessToken}`);
          headers.set("apikey", SUPABASE_PUBLISHABLE_KEY);
        }
        return fetch(input, { ...init, headers });
      },
    },
  });
  return cached;
}
