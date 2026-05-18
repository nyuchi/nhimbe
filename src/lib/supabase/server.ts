/**
 * Server-side Supabase client for the nyuchi_platform_db. Use from RSC
 * and route handlers. Reads with the publishable key by default; pass an
 * access token to act as the authenticated person.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export function getSupabaseServerClient(accessToken?: string): SupabaseClient {
  // Mirror of assertBrowserContext() in client.ts. Calling the SSR client
  // from the browser is a developer mistake: it has no access-token plumbing
  // (no shared module-level token, no auth-context hook), so it would silently
  // send unauthenticated requests. Throw at the call site so the bug surfaces
  // immediately instead of at the first RLS-rejected query.
  if (typeof window !== "undefined") {
    throw new Error(
      "[nhimbe] src/lib/supabase/server.ts was called from a browser context. " +
        "Use src/lib/supabase/client.ts in client components instead.",
    );
  }
  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
    throw new Error(
      "[mukoko] Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    );
  }
  return createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: {
      headers: {
        "x-client-info": "nhimbe-web-ssr",
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
    },
  });
}
