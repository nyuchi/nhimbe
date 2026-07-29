/**
 * Canonical WorkOS AuthKit endpoint metadata for agent/MCP discovery.
 *
 * These endpoints describe the **AuthKit OAuth 2.1 authorization server** that
 * MCP clients run standard discovery against (RFC 8414 / RFC 9728 / OIDC
 * Discovery). Every published discovery document — the three `.well-known/*`
 * route handlers and `/auth.md` — MUST build its endpoints from here rather
 * than hardcoding a host, so a single edit keeps all four coherent.
 *
 * Two distinct WorkOS domains are in play, and getting them right is the whole
 * point of this file:
 *
 * - `WORKOS_AUTHKIT_DOMAIN` — the hosted **AuthKit** domain
 *   (`identity.nyuchi.com` in production). This is the OAuth 2.1 authorization
 *   server: it serves its own self-consistent `/.well-known/oauth-authorization-server`
 *   and hosts the `/oauth2/{authorize,token,register,jwks}` endpoints, including
 *   **dynamic client registration** (`/oauth2/register`) and client-id metadata
 *   documents. This is what an MCP client must be pointed at — the API domain
 *   below serves NO authorization-server metadata (a client that follows the
 *   RFC 9728 `authorization_servers` pointer there gets a 404 and the flow
 *   dead-ends). So discovery advertises the AuthKit domain.
 *
 * - `WORKOS_API_HOSTNAME` — the WorkOS **API** domain (`authenticate.nyuchi.com`
 *   in production; the `api.workos.com` custom-domain stand-in). This is what
 *   the bearer-token verifier (`src/lib/auth/workos-token.ts`) fetches JWKS from
 *   at `/sso/jwks/${WORKOS_CLIENT_ID}`.
 *
 * Why advertising a different host than the verifier reads is SAFE here: a WorkOS
 * environment signs all access tokens — whether issued via the legacy
 * User-Management flow or the OAuth 2.1 `/oauth2/token` flow — with a single
 * environment key, and publishes that same key (identical `kid`) at BOTH the
 * AuthKit domain's `/oauth2/jwks` and the API domain's per-client
 * `/sso/jwks/{clientId}`. So a token minted through the OAuth2/connect-app flow
 * the discovery documents point agents at verifies cleanly against the JWKS the
 * app already trusts. The verifier checks signature + expiry + subject only (no
 * `aud`/`iss` pinning), so the issuer we advertise never has to equal the host
 * the verifier reads keys from.
 */

/** WorkOS API host (JWKS the verifier reads). Mirrors `workos-token.ts`. */
export function workosApiHost(): string {
  return process.env.WORKOS_API_HOSTNAME || "api.workos.com";
}

/**
 * Hosted AuthKit domain — the OAuth 2.1 authorization server MCP clients
 * discover and authenticate against. Defaults to the production domain; override
 * per environment (e.g. a WorkOS-hosted `*.authkit.app` domain) via env.
 */
export function workosAuthkitDomain(): string {
  const raw = process.env.WORKOS_AUTHKIT_DOMAIN || "identity.nyuchi.com";
  // Callers prepend `https://`, so accept a value supplied with a scheme and/or
  // trailing slash (the sibling MCP workers store it as `https://identity.nyuchi.com`)
  // and normalise to a bare host — otherwise it would double to `https://https://…`.
  return raw.replace(/^https?:\/\//i, "").replace(/\/+$/, "");
}

/** WorkOS client id — the JWKS key-set selector the verifier uses. Empty when unset. */
export function workosClientId(): string {
  return process.env.WORKOS_CLIENT_ID ?? "";
}

/**
 * WorkOS client id for the **MCP OAuth connector** — a WorkOS Connect app that
 * is DISTINCT from the app's first-party AuthKit login client
 * (`WORKOS_CLIENT_ID`). MCP clients (e.g. Claude/ChatGPT connectors) authorize
 * against this one; keeping it separate is what lets its redirect URIs and
 * consent behaviour be configured for the third-party connector flow (the app's
 * own login client isn't set up for it — hence the `state`-drop failures).
 *
 * A client id is a **public** OAuth identifier (it rides in every authorize URL
 * and discovery doc), NOT a secret — so it lives in a plain env var, with the
 * production value as the default. Override per environment via
 * `WORKOS_MCP_CLIENT_ID`. The bearer-token verifier needs no change: a WorkOS
 * environment signs every access token with one key, so tokens minted through
 * this client verify against the same JWKS the app already trusts.
 */
export function workosMcpClientId(): string {
  return process.env.WORKOS_MCP_CLIENT_ID || "client_01KYH11K4XV3HRPGMAQ4JS18RH";
}

export interface WorkosAuthMetadata {
  /** OAuth/OIDC issuer — the AuthKit (authorization-server) domain origin. */
  issuer: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  /** Authorization-server JWKS URL (same signing key as the verifier's per-client JWKS). */
  jwksUri: string;
  /** Dynamic-client-registration (DCR) endpoint. */
  registrationEndpoint: string;
  clientId: string;
}

/**
 * The one place discovery endpoints are computed. Pass `{ mcp: true }` when the
 * document is being served for the MCP resource (`events.mukoko.com`) so the
 * advertised `clientId` is the dedicated MCP Connect app rather than the app's
 * first-party login client.
 */
export function workosAuthMetadata(opts?: { mcp?: boolean }): WorkosAuthMetadata {
  const base = `https://${workosAuthkitDomain()}`;
  return {
    issuer: base,
    authorizationEndpoint: `${base}/oauth2/authorize`,
    tokenEndpoint: `${base}/oauth2/token`,
    jwksUri: `${base}/oauth2/jwks`,
    registrationEndpoint: `${base}/oauth2/register`,
    clientId: opts?.mcp ? workosMcpClientId() : workosClientId(),
  };
}
