/**
 * Tiny client for the `payments-intents` Edge Function on nyuchi_pay_db.
 *
 * The pay DB is API-only — direct PostgREST access is locked down via RLS
 * and the service-role key never leaves the Edge Function runtime. Auth is
 * pure WorkOS access-token pass-through: the worker forwards the signed-in
 * user's JWT, and the Edge Function validates it locally against WorkOS's
 * JWKS (no machine-to-machine secret on this path).
 *
 * Webhooks (Paynow callbacks) live in a separate `payments-webhooks-paynow`
 * function and use HMAC-SHA512 signature verification — that flow has no
 * user context, so it doesn't go through this client.
 */

import type { Env } from "../types";

export class PayApiConfigError extends Error {
  constructor() {
    super("[mukoko] Missing pay-api env: SUPABASE_PAY_URL");
    this.name = "PayApiConfigError";
  }
}

interface PayApiOptions {
  /** Edge function path AFTER the function name, e.g. "/v1/health" or "/v1/intents". */
  path: string;
  method?: "GET" | "POST";
  body?: unknown;
  /** WorkOS access token from the signed-in user's request. Required for auth-protected paths. */
  accessToken: string;
}

export async function payApiFetch<T>(env: Env, opts: PayApiOptions): Promise<T> {
  const url = env.SUPABASE_PAY_URL;
  if (!url) throw new PayApiConfigError();

  const fullUrl = `${url.replace(/\/$/, "")}/functions/v1/payments-intents${opts.path}`;

  const response = await fetch(fullUrl, {
    method: opts.method ?? "GET",
    headers: {
      Authorization: `Bearer ${opts.accessToken}`,
      "Content-Type": "application/json",
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`[mukoko] pay-api ${opts.method ?? "GET"} ${opts.path} failed (${response.status}): ${text.slice(0, 200)}`);
  }
  return (await response.json()) as T;
}
