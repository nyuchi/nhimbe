/**
 * WorkOS Access Token Validation for nhimbe Worker
 *
 * AuthKit (frontend) issues WorkOS access tokens; the worker validates them
 * locally using WorkOS's public JWKS — no WorkOS API call required for the
 * common auth-on-every-request path.
 *
 * Replaces the previous Stytch JWT validator. Same shape (RS256 signed JWT,
 * JWKS-backed, cached for 1 hour) — only the issuer / audience / JWKS URL
 * change. Caller surface is unchanged: getAuthenticatedUser() still returns
 * an AuthResult and the same failure-reason enum (with `_workos_` namespacing
 * for the few enum values that were Stytch-specific).
 */

interface WorkOSEnv {
  /** Public WorkOS Client ID — used both as the audience claim and to build the JWKS URL. */
  WORKOS_CLIENT_ID: string;
}

export interface AuthenticatedUser {
  /** WorkOS user id (e.g. user_01H...). Use this to look up identity.person via workos_user_id. */
  userId: string;
  /** Optional org id from the access token (when the user is signed in to a specific organisation). */
  organizationId?: string;
  /** Email claim if present in the access token. */
  email?: string;
}

// ============================================
// JWKS Cache & Fetching
// ============================================

interface JWK {
  kty: string;
  kid: string;
  n: string;
  e: string;
  alg?: string;
  use?: string;
}

interface JWKS {
  keys: JWK[];
}

let jwksCache: { keys: JWKS; fetchedAt: number } | null = null;
const JWKS_CACHE_TTL = 3600_000; // 1 hour

function getJwksUrl(clientId: string): string {
  return `https://api.workos.com/sso/jwks/${clientId}`;
}

async function fetchJWKS(clientId: string): Promise<JWKS> {
  const url = getJwksUrl(clientId);
  const maxRetries = 2;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      if (attempt > 0) {
        await new Promise((r) => setTimeout(r, attempt * 500));
      }
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to fetch JWKS: ${response.status}`);
      }
      return response.json() as Promise<JWKS>;
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
    }
  }

  throw lastError!;
}

async function getJWKS(clientId: string, forceRefresh = false): Promise<JWKS> {
  if (
    !forceRefresh &&
    jwksCache &&
    Date.now() - jwksCache.fetchedAt < JWKS_CACHE_TTL
  ) {
    return jwksCache.keys;
  }

  const jwks = await fetchJWKS(clientId);
  jwksCache = { keys: jwks, fetchedAt: Date.now() };
  return jwks;
}

// ============================================
// JWT Parsing & Verification
// ============================================

function base64urlDecode(input: string): Uint8Array {
  let str = input.replace(/-/g, "+").replace(/_/g, "/");
  while (str.length % 4) str += "=";
  const binary = atob(str);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function importRSAPublicKey(jwk: JWK): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "jwk",
    { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: "RS256" },
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"],
  );
}

interface JWTHeader {
  alg: string;
  kid: string;
  typ?: string;
}

interface JWTPayload {
  sub: string;
  iss: string;
  aud?: string | string[];
  exp: number;
  iat: number;
  nbf?: number;
  email?: string;
  /** WorkOS organisation id (when signed in to a specific org). */
  org_id?: string;
}

export type JWTFailureReason =
  | "malformed_token"
  | "unsupported_algorithm"
  | "jwks_fetch_failed"
  | "key_not_found"
  | "invalid_signature"
  | "token_expired"
  | "token_not_yet_valid"
  | "issuer_mismatch"
  | "audience_mismatch"
  | "verification_error";

export interface JWTResult {
  payload: JWTPayload | null;
  failureReason?: JWTFailureReason;
  detail?: string;
}

async function verifyJWT(token: string, clientId: string): Promise<JWTResult> {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return { payload: null, failureReason: "malformed_token" };

    const [headerB64, payloadB64, signatureB64] = parts;

    const header: JWTHeader = JSON.parse(new TextDecoder().decode(base64urlDecode(headerB64)));
    if (header.alg !== "RS256" || !header.kid) {
      return {
        payload: null,
        failureReason: "unsupported_algorithm",
        detail: `alg=${header.alg}, kid=${header.kid}`,
      };
    }

    let jwks: JWKS;
    try {
      jwks = await getJWKS(clientId);
    } catch (e) {
      return { payload: null, failureReason: "jwks_fetch_failed", detail: String(e) };
    }
    let jwk = jwks.keys.find((k) => k.kid === header.kid);

    if (!jwk) {
      try {
        jwks = await getJWKS(clientId, true);
      } catch (e) {
        return { payload: null, failureReason: "jwks_fetch_failed", detail: `refresh: ${String(e)}` };
      }
      jwk = jwks.keys.find((k) => k.kid === header.kid);
      if (!jwk) {
        return { payload: null, failureReason: "key_not_found", detail: `kid=${header.kid}` };
      }
    }

    const key = await importRSAPublicKey(jwk);
    const data = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
    const signature = base64urlDecode(signatureB64);

    const valid = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, signature, data);
    if (!valid) return { payload: null, failureReason: "invalid_signature" };

    const payload: JWTPayload = JSON.parse(new TextDecoder().decode(base64urlDecode(payloadB64)));

    const now = Math.floor(Date.now() / 1000);

    if (payload.exp && now >= payload.exp) {
      return {
        payload: null,
        failureReason: "token_expired",
        detail: `exp=${payload.exp}, now=${now}, expired ${now - payload.exp}s ago`,
      };
    }
    if (payload.nbf && now < payload.nbf) {
      return { payload: null, failureReason: "token_not_yet_valid", detail: `nbf=${payload.nbf}, now=${now}` };
    }
    // WorkOS sets iss to https://api.workos.com (no client-id suffix).
    if (payload.iss !== "https://api.workos.com") {
      return {
        payload: null,
        failureReason: "issuer_mismatch",
        detail: `got="${payload.iss}", expected="https://api.workos.com"`,
      };
    }

    // Audience can be string or array, and may be omitted on some token kinds.
    if (payload.aud) {
      const audMatches = Array.isArray(payload.aud) ? payload.aud.includes(clientId) : payload.aud === clientId;
      if (!audMatches) {
        return {
          payload: null,
          failureReason: "audience_mismatch",
          detail: `aud=${JSON.stringify(payload.aud)}, expected="${clientId}"`,
        };
      }
    }

    return { payload };
  } catch (error) {
    console.error("[mukoko:auth] WorkOS JWT verification error:", error);
    return { payload: null, failureReason: "verification_error", detail: String(error) };
  }
}

// ============================================
// Public API
// ============================================

export function extractBearerToken(request: Request): string | null {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return null;
  }
  return authHeader.substring(7);
}

export interface AuthResult {
  user: AuthenticatedUser | null;
  failureReason?: JWTFailureReason | "no_token";
  detail?: string;
}

/**
 * Validate the WorkOS access token locally and return the authenticated user.
 * No WorkOS API calls are made — verification uses the public JWKS.
 */
export async function getAuthenticatedUser(
  request: Request,
  env: WorkOSEnv,
): Promise<AuthResult> {
  const token = extractBearerToken(request);
  if (!token) return { user: null, failureReason: "no_token" };

  const result = await verifyJWT(token, env.WORKOS_CLIENT_ID);
  if (!result.payload) {
    return { user: null, failureReason: result.failureReason, detail: result.detail };
  }

  return {
    user: {
      userId: result.payload.sub,
      organizationId: result.payload.org_id,
      email: result.payload.email,
    },
  };
}
