// OpenID Connect Discovery 1.0 (OIDC provider metadata)
// https://openid.net/specs/openid-connect-discovery-1_0.html
//
// Mirrors the WorkOS AuthKit OpenID provider configuration so agents can run
// standard OIDC discovery against the nhimbe origin. Extends the RFC 8414
// authorization-server metadata with OIDC-specific fields (subject types and
// the id_token signing algorithm — WorkOS JWKS is RS256).
// Served statically at /.well-known/openid-configuration.

export const dynamic = "force-static";

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
  return metadata({
    issuer: "https://api.workos.com",
    authorization_endpoint: "https://api.workos.com/user_management/authorize",
    token_endpoint: "https://api.workos.com/user_management/authenticate",
    jwks_uri: "https://api.workos.com/sso/jwks/client_01KQBBSMQTSMTBN7HEC9KQBJC0",
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["client_secret_post", "none"],
    scopes_supported: ["openid", "profile", "email", "offline_access"],
    subject_types_supported: ["public"],
    id_token_signing_alg_values_supported: ["RS256"],
  });
}
