/**
 * Tiny client for the api.mukoko.com gateway (FastAPI on fly.io).
 *
 * api.mukoko.com is the public façade that owns API-key management and
 * brokers access to private back-end stores (pay-db, platform-db, …). The
 * nhimbe worker is one of many consumers. Auth is dual-credential:
 *
 *   • X-Api-Key            — always required. Identifies the calling system
 *                            (the worker's machine-context credential, set
 *                            via `wrangler secret put MUKOKO_API_KEY`).
 *   • Authorization Bearer — optional. Pass through the signed-in user's
 *                            WorkOS access token when a request is acting
 *                            on behalf of an end user; api.mukoko.com
 *                            validates it against WorkOS's JWKS.
 *
 * Webhooks (Paynow callbacks) hit api.mukoko.com directly with HMAC
 * verification — no worker involvement, no client code here.
 */

import type { Env } from "../types";

export class MukokoApiConfigError extends Error {
  constructor(missing: string) {
    super(`[mukoko] Missing api.mukoko.com env: ${missing}`);
    this.name = "MukokoApiConfigError";
  }
}

interface MukokoApiOptions {
  /** Path beginning with "/", e.g. "/v1/payments/intents". */
  path: string;
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  /** Pass the user's WorkOS access token when this call is user-context. */
  userAccessToken?: string;
}

export async function mukokoApiFetch<T>(env: Env, opts: MukokoApiOptions): Promise<T> {
  const baseUrl = env.MUKOKO_API_URL;
  const apiKey = env.MUKOKO_API_KEY;
  if (!baseUrl) throw new MukokoApiConfigError("MUKOKO_API_URL");
  if (!apiKey) throw new MukokoApiConfigError("MUKOKO_API_KEY");

  const headers: Record<string, string> = {
    "X-Api-Key": apiKey,
    "Content-Type": "application/json",
  };
  if (opts.userAccessToken) {
    headers["Authorization"] = `Bearer ${opts.userAccessToken}`;
  }

  const response = await fetch(`${baseUrl.replace(/\/$/, "")}${opts.path}`, {
    method: opts.method ?? "GET",
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(
      `[mukoko] api.mukoko.com ${opts.method ?? "GET"} ${opts.path} failed (${response.status}): ${text.slice(0, 200)}`,
    );
  }
  return (await response.json()) as T;
}
