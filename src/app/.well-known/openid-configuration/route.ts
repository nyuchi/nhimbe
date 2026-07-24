// OpenID Connect Discovery 1.0 (OIDC provider metadata)
// https://openid.net/specs/openid-connect-discovery-1_0.html
//
// Mirrors the WorkOS AuthKit OpenID provider configuration so agents can run
// standard OIDC discovery against the nhimbe origin. Extends the RFC 8414
// authorization-server metadata with OIDC-specific fields (subject types and
// the id_token signing algorithm — WorkOS JWKS is RS256).
// Served statically at /.well-known/openid-configuration.

import { workosAuthMetadata } from "@/lib/auth/workos-metadata";

// force-dynamic: endpoints are derived at request time from the same runtime env
// (WORKOS_CLIENT_ID / WORKOS_API_HOSTNAME) the token verifier reads — no drift,
// no empty client id baked when build-time env is absent. Cached 1h below.
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
    subject_types_supported: ["public"],
    id_token_signing_alg_values_supported: ["RS256"],
  });
}
