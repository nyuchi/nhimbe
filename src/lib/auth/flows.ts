import "server-only";
import { getWorkOS } from "@workos-inc/authkit-nextjs";

/**
 * Self-hosted sign-in flows built on the WorkOS headless User Management API.
 *
 * These helpers only *build* the authorization URL the browser is sent to;
 * the authorization code that comes back is exchanged for a session by
 * `/callback` (`handleAuth`). Keeping the URL-building here means the SSO
 * route handler stays thin. SSO is a dormant capability — the sign-in UI
 * exposes email code and password today — but the wiring stays ready.
 */

/**
 * Clamp a caller-supplied `return_to` to a safe local path. Anything that
 * isn't a plain absolute path (external URLs, protocol-relative `//host`,
 * backslash tricks) falls back to the home page — never an open redirect.
 */
export function safeReturnTo(value: string | null | undefined): string {
  if (!value || !value.startsWith("/")) return "/";
  if (value.startsWith("//") || value.startsWith("/\\")) return "/";
  return value;
}

/**
 * Cheap, linear email sanity check (no regex → no ReDoS). WorkOS does the
 * authoritative validation; this just rejects obvious junk before the lookup.
 */
function looksLikeEmail(value: string): boolean {
  if (value.length > 320 || /\s/.test(value)) return false;
  const at = value.indexOf("@");
  if (at <= 0 || at !== value.lastIndexOf("@")) return false;
  const domain = value.slice(at + 1);
  const dot = domain.lastIndexOf(".");
  return dot > 0 && dot < domain.length - 1;
}

/**
 * Encode `return_to` into the OAuth `state` so the callback can honor it.
 * `/callback` currently ignores state (default `/` is fine), but we pass it
 * for forward-compat with a future state-aware handler.
 */
function encodeState(returnTo: string): string {
  return Buffer.from(JSON.stringify({ returnTo }), "utf8").toString("base64url");
}

/** Client id + redirect URI, or `null` when the deployment isn't configured. */
function authConfig(): { clientId: string; redirectUri: string } | null {
  const clientId = process.env.WORKOS_CLIENT_ID;
  const redirectUri = process.env.NEXT_PUBLIC_WORKOS_REDIRECT_URI;
  if (!clientId || !redirectUri) return null;
  return { clientId, redirectUri };
}

/** Discriminated outcome of an SSO lookup, mapped to HTTP statuses by the route. */
export type SsoResult =
  | { status: "ok"; url: string }
  | { status: "config" }
  | { status: "invalid-email" }
  | { status: "not-found" }
  | { status: "error" };

/**
 * Resolve a work email's domain to a WorkOS organization and build its SSO
 * authorization URL. A domain with no matching org yields `not-found` so the
 * UI can nudge the user toward email code or a password instead.
 */
export async function ssoAuthUrlForEmail(email: string, returnTo: string): Promise<SsoResult> {
  const config = authConfig();
  if (!config) return { status: "config" };

  const normalized = email.trim().toLowerCase();
  if (!looksLikeEmail(normalized)) return { status: "invalid-email" };
  const domain = normalized.slice(normalized.indexOf("@") + 1);

  try {
    const orgs = await getWorkOS().organizations.listOrganizations({
      domains: [domain],
      limit: 1,
    });
    const org = orgs.data[0];
    if (!org) return { status: "not-found" };

    const url = getWorkOS().userManagement.getAuthorizationUrl({
      clientId: config.clientId,
      redirectUri: config.redirectUri,
      organizationId: org.id,
      state: encodeState(safeReturnTo(returnTo)),
    });
    return { status: "ok", url };
  } catch (err) {
    console.error("[mukoko:auth] SSO org lookup failed:", err);
    return { status: "error" };
  }
}
