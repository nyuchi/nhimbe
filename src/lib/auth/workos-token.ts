import "server-only";

/**
 * Verify a WorkOS AuthKit **access token** (JWT) presented as a bearer.
 *
 * The app's normal auth path is cookie sessions via `withAuth()`. Machine/agent
 * callers — notably the nhimbe MCP server — can't carry that cookie, so the
 * MCP write endpoints (`POST /api/events`, `PATCH /api/events/:id`) instead
 * accept `Authorization: Bearer <workos_access_token>`. WorkOS access tokens
 * are RS256 JWTs signed with the keys published at
 * `https://api.workos.com/sso/jwks/{clientId}`; we verify the signature with
 * Web Crypto (no extra dependency) and return the subject (WorkOS user id).
 *
 * This is a signature-verifying gate, not a full session — it establishes only
 * "this bearer proves the WorkOS user `sub`". The endpoint then resolves that
 * user to an `identity.persons` doc for entity-centric authorization.
 */

interface Jwk {
  kid: string;
  kty: string;
  n: string;
  e: string;
  alg?: string;
}

interface CachedJwks {
  keys: Jwk[];
  fetchedAt: number;
}

const JWKS_TTL_MS = 10 * 60 * 1000; // 10 minutes
let jwksCache: CachedJwks | null = null;

export interface VerifiedToken {
  /** WorkOS user id (JWT `sub`). */
  workosUserId: string;
  /** Session id (`sid`), when present. */
  sessionId?: string;
  /** Raw decoded claims for callers that need more. */
  claims: Record<string, unknown>;
}

function base64UrlToBytes(input: string): Uint8Array<ArrayBuffer> {
  const b64 = input.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(input.length / 4) * 4, "=");
  const binary = atob(b64);
  // Back the view with a concrete ArrayBuffer so it satisfies `BufferSource`
  // (a plain `new Uint8Array(len)` infers `ArrayBufferLike`, which Web Crypto rejects).
  const buffer = new ArrayBuffer(binary.length);
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function decodeJson(segment: string): Record<string, unknown> {
  return JSON.parse(new TextDecoder().decode(base64UrlToBytes(segment)));
}

function jwksUrl(): string {
  const clientId = process.env.WORKOS_CLIENT_ID;
  if (!clientId) throw new Error("WORKOS_CLIENT_ID is not set — cannot verify bearer tokens.");
  const host = process.env.WORKOS_API_HOSTNAME || "api.workos.com";
  return `https://${host}/sso/jwks/${clientId}`;
}

async function getJwks(): Promise<Jwk[]> {
  if (jwksCache && Date.now() - jwksCache.fetchedAt < JWKS_TTL_MS) {
    return jwksCache.keys;
  }
  const res = await fetch(jwksUrl(), { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`Failed to fetch WorkOS JWKS (${res.status})`);
  const body = (await res.json()) as { keys?: Jwk[] };
  const keys = body.keys ?? [];
  jwksCache = { keys, fetchedAt: Date.now() };
  return keys;
}

/**
 * Verify `token` and return its claims, or throw `TokenVerificationError` on any
 * failure (malformed, unknown key, bad signature, expired).
 */
export class TokenVerificationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TokenVerificationError";
  }
}

export async function verifyWorkosAccessToken(token: string): Promise<VerifiedToken> {
  const parts = token.split(".");
  if (parts.length !== 3) throw new TokenVerificationError("Malformed token.");
  const [headerB64, payloadB64, signatureB64] = parts;

  let header: Record<string, unknown>;
  let claims: Record<string, unknown>;
  try {
    header = decodeJson(headerB64);
    claims = decodeJson(payloadB64);
  } catch {
    throw new TokenVerificationError("Token is not valid JSON.");
  }

  if (header.alg !== "RS256") throw new TokenVerificationError(`Unsupported alg: ${String(header.alg)}`);

  const keys = await getJwks();
  const jwk = keys.find((k) => k.kid === header.kid);
  if (!jwk) throw new TokenVerificationError("Signing key not found in JWKS.");

  const key = await crypto.subtle.importKey(
    "jwk",
    { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: "RS256", ext: true },
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"],
  );

  const data = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
  const valid = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    key,
    base64UrlToBytes(signatureB64),
    data,
  );
  if (!valid) throw new TokenVerificationError("Bad signature.");

  const now = Math.floor(Date.now() / 1000);
  if (typeof claims.exp === "number" && claims.exp < now) {
    throw new TokenVerificationError("Token expired.");
  }
  if (typeof claims.nbf === "number" && claims.nbf > now + 60) {
    throw new TokenVerificationError("Token not yet valid.");
  }
  const sub = claims.sub;
  if (typeof sub !== "string" || !sub) throw new TokenVerificationError("Token has no subject.");

  return {
    workosUserId: sub,
    sessionId: typeof claims.sid === "string" ? claims.sid : undefined,
    claims,
  };
}

/** Extract + verify a bearer token from an `Authorization` header, or return null. */
export async function verifyBearer(authorization: string | null): Promise<VerifiedToken | null> {
  if (!authorization || !authorization.startsWith("Bearer ")) return null;
  const token = authorization.slice(7).trim();
  if (!token) return null;
  return verifyWorkosAccessToken(token);
}
