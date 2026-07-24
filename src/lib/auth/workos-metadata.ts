/**
 * Canonical WorkOS AuthKit endpoint metadata.
 *
 * Derived from the SAME environment variables the bearer-token verifier uses
 * (`src/lib/auth/workos-token.ts` → `jwksUrl()`): `WORKOS_CLIENT_ID` and
 * `WORKOS_API_HOSTNAME`. Every published discovery document — the three
 * `.well-known/*` route handlers and `/auth.md` — MUST build its endpoints
 * from here rather than hardcoding a client id or host.
 *
 * Why this exists: WorkOS publishes JWKS signing keys *per client id*, and the
 * app fetches keys from `https://${WORKOS_API_HOSTNAME}/sso/jwks/${WORKOS_CLIENT_ID}`.
 * If discovery advertises a different client id or host than the verifier uses,
 * an agent obtains a token issued under the advertised client while the app
 * looks up keys for a different one — the token's `kid` is absent from that key
 * set and every MCP write fails with 401. Keeping discovery and verification on
 * one code path makes that drift structurally impossible.
 *
 * `WORKOS_API_HOSTNAME` is the WorkOS **API** domain (authorize/token/JWKS —
 * `authenticate.nyuchi.com` in production, default `api.workos.com`). This is
 * deliberately NOT the hosted-UI domain (`identity.nyuchi.com`), which serves
 * the sign-in screen, not the token/JWKS API.
 */

/** WorkOS API host (authorize/token/JWKS). Mirrors `workos-token.ts`. */
export function workosApiHost(): string {
  return process.env.WORKOS_API_HOSTNAME || "api.workos.com";
}

/** WorkOS client id — the JWKS key-set selector. Empty when unset. */
export function workosClientId(): string {
  return process.env.WORKOS_CLIENT_ID ?? "";
}

export interface WorkosAuthMetadata {
  /** OAuth/OIDC issuer — the API host origin. */
  issuer: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  /** Per-client JWKS URL the verifier fetches keys from. */
  jwksUri: string;
  /** Dynamic-client-registration (DCR) endpoint. */
  registrationEndpoint: string;
  clientId: string;
}

/** The one place discovery endpoints are computed. */
export function workosAuthMetadata(): WorkosAuthMetadata {
  const host = workosApiHost();
  const clientId = workosClientId();
  const base = `https://${host}`;
  return {
    issuer: base,
    authorizationEndpoint: `${base}/user_management/authorize`,
    tokenEndpoint: `${base}/user_management/authenticate`,
    jwksUri: `${base}/sso/jwks/${clientId}`,
    registrationEndpoint: `${base}/oauth2/register`,
    clientId,
  };
}
