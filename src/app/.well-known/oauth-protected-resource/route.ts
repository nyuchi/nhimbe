// OAuth 2.0 Protected Resource Metadata (RFC 9728)
// https://www.rfc-editor.org/rfc/rfc9728
//
// nhimbe is a RESOURCE SERVER: its APIs are protected by WorkOS AuthKit-issued
// JWTs. This endpoint lets agents/clients discover which authorization server(s)
// issue the tokens accepted here, plus supported scopes and bearer methods.
// Served statically at /.well-known/oauth-protected-resource.

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
    resource: "https://nhimbe.com",
    authorization_servers: ["https://api.workos.com"],
    scopes_supported: ["openid", "profile", "email", "offline_access"],
    bearer_methods_supported: ["header"],
    resource_documentation: "https://nhimbe.com/auth.md",
  });
}
