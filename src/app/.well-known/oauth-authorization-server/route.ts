// OAuth 2.0 Authorization Server Metadata (RFC 8414)
// https://www.rfc-editor.org/rfc/rfc8414
//
// nhimbe delegates authentication to WorkOS AuthKit (the authorization server).
// This endpoint mirrors the WorkOS AS metadata so agents can discover the
// authorization/token/JWKS endpoints directly from the nhimbe origin.
// Served statically at /.well-known/oauth-authorization-server.

import { workosAuthMetadata } from "@/lib/auth/workos-metadata";

// force-dynamic: endpoints are derived at request time from the SAME runtime env
// (WORKOS_CLIENT_ID / WORKOS_API_HOSTNAME) the token verifier reads, so this
// document can never advertise a different client id or host than the app
// actually verifies against — not even if build-time env differs or is absent.
// The 1-hour Cache-Control below still lets CDNs/agents cache the result.
export const dynamic = "force-dynamic";

// Small self-contained helper: JSON body + the shared discovery headers.
function metadata(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=3600",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

export async function GET(): Promise<Response> {
  const workos = workosAuthMetadata();
  return metadata({
    issuer: workos.issuer,
    authorization_endpoint: workos.authorizationEndpoint,
    token_endpoint: workos.tokenEndpoint,
    jwks_uri: workos.jwksUri,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["client_secret_post", "none"],
    scopes_supported: ["openid", "profile", "email", "offline_access"],
  });
}
