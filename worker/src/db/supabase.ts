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
import { withRetry } from "../utils/retry";
import { withCircuitBreakerThrow } from "../utils/circuit-breaker";

export class SupabaseConfigError extends Error {
  constructor() {
    super("[mukoko] SUPABASE_URL or SUPABASE_SECRET_KEY missing on env");
    this.name = "SupabaseConfigError";
  }
}

/**
 * Thrown by supabaseFetch when the upstream returns a transient error
 * (502/503/504) or the fetch itself fails. Distinct from generic Error so
 * the retry layer can decide what to retry without inspecting strings.
 */
export class SupabaseTransientError extends Error {
  constructor(message: string, public readonly status?: number) {
    super(message);
    this.name = "SupabaseTransientError";
  }
}

/**
 * Thrown by supabaseFetch when PostgREST returns a non-transient error —
 * 4xx (caller bugs: bad query, duplicate row, missing FK) or 500 (malformed
 * query, broken trigger). Carries the original HTTP status and raw response
 * body so route handlers can switch on `err.status === 409` (etc.) instead
 * of grepping the message string. Does NOT count against the circuit
 * breaker — see `shouldCountAsFailure` in `supabaseFetch` below.
 */
export class SupabaseClientError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: string,
    message: string,
  ) {
    super(message);
    this.name = "SupabaseClientError";
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
  const key = env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new SupabaseConfigError();

  const headers = new Headers({
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
  });

  const method = opts.method ?? "GET";
  const isWrite = method !== "GET";
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

  const doFetch = async (): Promise<T | null> => {
    let response: Response;
    try {
      response = await fetch(fullUrl, {
        method,
        headers,
        body: opts.body ? JSON.stringify(opts.body) : undefined,
      });
    } catch (err) {
      // Network-level failure (DNS, TLS, connection reset). Always transient.
      throw new SupabaseTransientError(
        `[mukoko] Supabase ${method} ${opts.path} network error: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    if (response.status === 406 && opts.single) {
      // PostgREST returns 406 from `single=true` when no rows match. Treat as null.
      return null;
    }
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      const msg = `[mukoko] Supabase ${method} ${opts.path} failed (${response.status}): ${text.slice(0, 200)}`;
      // 502/503/504 from PostgREST or Supabase edge are worth retrying.
      // 4xx and other 5xx (e.g. 500 = malformed query) are not.
      if (response.status === 502 || response.status === 503 || response.status === 504) {
        throw new SupabaseTransientError(msg, response.status);
      }
      // 4xx (caller bug, uniqueness violation, FK miss) and 500 (malformed
      // query, broken trigger) — surface as a typed error so route handlers
      // can switch on `err.status === 409` instead of grepping the message.
      throw new SupabaseClientError(response.status, text, msg);
    }

    if (response.status === 204) return null;
    return (await response.json()) as T;
  };

  // Wrap fetches with the circuit breaker so a sustained Supabase outage
  // surfaces as 503s immediately instead of stalling every worker invocation
  // on the timeout. Only SupabaseTransientError counts against the breaker —
  // 4xx caller bugs and 500 (malformed query) errors don't open the circuit.
  const breakerWrapped = () =>
    withCircuitBreakerThrow("supabase", doFetch, {
      shouldCountAsFailure: (err) => err instanceof SupabaseTransientError,
    });

  // Retry the idempotent GET path only. Writes go through unchanged to avoid
  // duplicate POST/PATCH/DELETE side effects if the request actually succeeded
  // server-side but the response was lost in transit.
  if (isWrite) return breakerWrapped();

  return withRetry(breakerWrapped, {
    maxRetries: 2,
    baseDelayMs: 200,
    maxDelayMs: 2_000,
    shouldRetry: (err) => err instanceof SupabaseTransientError,
  });
}
