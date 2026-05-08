/**
 * Tiny client for the `payments-api` Edge Function on nyuchi_pay_db.
 *
 * The pay DB is API-only — direct PostgREST access is locked down via RLS
 * and the service-role key never leaves the Edge Function runtime. The
 * worker proves it's a trusted caller by sending two headers:
 *   - x-supabase-pay-publishable-key  : sb_publishable_…  (caller identity)
 *   - Authorization: Bearer <PAY_API_KEY>                 (shared secret)
 *
 * Both are timing-safe-compared on the pay side. The publishable key lets
 * us roll caller identities independently of the shared secret if a
 * consumer is compromised.
 */

import type { Env } from "../types";

export class PayApiConfigError extends Error {
  constructor() {
    super(
      "[mukoko] Missing pay-api env: SUPABASE_PAY_URL / SUPABASE_PAY_PUBLISHABLE_KEY / PAY_API_KEY",
    );
    this.name = "PayApiConfigError";
  }
}

interface PayApiOptions {
  path: string;                       // "/v1/health" or "/v1/intents"
  method?: "GET" | "POST";
  body?: unknown;
}

export async function payApiFetch<T>(env: Env, opts: PayApiOptions): Promise<T> {
  const url = env.SUPABASE_PAY_URL;
  const publishableKey = env.SUPABASE_PAY_PUBLISHABLE_KEY;
  const apiKey = env.PAY_API_KEY;
  if (!url || !publishableKey || !apiKey) throw new PayApiConfigError();

  const fullUrl = `${url.replace(/\/$/, "")}/functions/v1/payments-api${opts.path}`;

  const response = await fetch(fullUrl, {
    method: opts.method ?? "GET",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "x-supabase-pay-publishable-key": publishableKey,
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
