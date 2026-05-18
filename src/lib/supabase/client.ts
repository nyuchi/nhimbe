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

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

let cached: SupabaseClient | null = null;

// Module-level token holder. Updated by setSupabaseAccessToken() from the
// auth-context provider so subsequent Supabase calls authenticate as the
// signed-in person without re-creating the client.
let accessToken: string | null = null;

// Guard against accidental server-side use. Imports from server contexts
// (RSC, route handlers, Next.js static prerender) are fine — they wouldn't
// hit the fetch path — but actually CALLING the client without a window
// means the access token wouldn't be set and RLS would reject the request.
// Throwing on access (not on import) keeps the module loadable during
// `next build` static prerender while still catching real developer mistakes.
function assertBrowserContext(): void {
  if (typeof window === "undefined") {
    throw new Error(
      "[nhimbe] src/lib/supabase/client.ts was called from a server context. " +
        "Use src/lib/supabase/server.ts in RSC / route handlers instead.",
    );
  }
}

export function setSupabaseAccessToken(token: string | null): void {
  // No assertBrowserContext here — auth-context calls this in a useEffect
  // which only runs client-side, and we want a noop-safe path during SSR.
  accessToken = token;
}

export function getSupabaseBrowserClient(): SupabaseClient {
  if (cached) return cached;
  assertBrowserContext();
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
