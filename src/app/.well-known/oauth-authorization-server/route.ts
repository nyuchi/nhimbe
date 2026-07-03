// OAuth 2.0 Authorization Server Metadata (RFC 8414)
// https://www.rfc-editor.org/rfc/rfc8414
//
// nhimbe delegates authentication to WorkOS AuthKit (the authorization server).
// This endpoint mirrors the WorkOS AS metadata so agents can discover the
// authorization/token/JWKS endpoints directly from the nhimbe origin.
// Served statically at /.well-known/oauth-authorization-server.

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
  });
}
