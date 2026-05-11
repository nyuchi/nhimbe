/**
 * Tiny Supabase REST helper for the worker.
 *
 * The worker is being shrunk — auth state lives in `nyuchi_platform_db`
 * (`identity.person`), not D1. For trusted server-side reads (admin role
 * lookup, etc.) we hit PostgREST directly with the service-role key, which
 * bypasses RLS.
 *
 * No `@supabase/supabase-js` — a 30-line fetch wrapper keeps the worker
 * bundle lean and avoids the SDK's auth/realtime overhead.
 */

import type { Env } from "../types";

export class SupabaseConfigError extends Error {
  constructor() {
    super("[mukoko] SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing on env");
    this.name = "SupabaseConfigError";
  }
}

interface SupabaseFetchOptions {
  /** Postgres schema (e.g. "identity", "events"). PostgREST routes via Accept-Profile / Content-Profile. */
  schema: string;
  /** Table or RPC path (e.g. "person", "event"). */
  path: string;
  /** Query string (e.g. "workos_user_id=eq.xyz&select=id,role"). */
  query?: string;
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  /** When true, asks PostgREST to return at most one row (sets Accept: application/vnd.pgrst.object+json). */
  single?: boolean;
}

export async function supabaseFetch<T>(env: Env, opts: SupabaseFetchOptions): Promise<T | null> {
  const url = env.SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new SupabaseConfigError();

  const headers = new Headers({
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
  });

  const isWrite = opts.method && opts.method !== "GET";
  if (isWrite) {
    headers.set("Content-Profile", opts.schema);
    headers.set("Prefer", "return=representation");
  } else {
    headers.set("Accept-Profile", opts.schema);
  }
  if (opts.single) {
    headers.set("Accept", "application/vnd.pgrst.object+json");
  }

  const fullUrl = `${url.replace(/\/$/, "")}/rest/v1/${opts.path}${opts.query ? `?${opts.query}` : ""}`;

  const response = await fetch(fullUrl, {
    method: opts.method ?? "GET",
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });

  if (response.status === 406 && opts.single) {
    // PostgREST returns 406 from `single=true` when no rows match. Treat as null.
    return null;
  }
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`[mukoko] Supabase ${opts.method ?? "GET"} ${opts.path} failed (${response.status}): ${text.slice(0, 200)}`);
  }

  if (response.status === 204) return null;
  return (await response.json()) as T;
}
