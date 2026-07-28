// OAuth 2.0 Protected Resource Metadata (RFC 9728)
// https://www.rfc-editor.org/rfc/rfc9728
//
// nhimbe is a RESOURCE SERVER: its APIs are protected by WorkOS AuthKit-issued
// JWTs. This endpoint lets agents/clients discover which authorization server(s)
// issue the tokens accepted here, plus supported scopes and bearer methods.
// Served statically at /.well-known/oauth-protected-resource.

import { workosAuthMetadata } from "@/lib/auth/workos-metadata";

// force-dynamic: the authorization server is derived at request time from
// runtime env (WORKOS_AUTHKIT_DOMAIN), and the `resource` identifier is derived
// from the request host so this document self-identifies correctly on whichever
// origin it's served from — nhimbe.com for the app's own API, events.mukoko.com
// for the MCP endpoint the worker challenges toward. An MCP client validates
// that `resource` matches the server it's talking to (RFC 9728), so a static
// value would fail that check on the events.mukoko.com copy. Cached 1h below.
export const dynamic = "force-dynamic";

// The resource identifier = the origin this document is served from. Behind the
// Cloudflare proxy the public host arrives as `x-forwarded-host` (falling back to
// `host`); default to the app's canonical origin when neither is present.
function resourceOrigin(request: Request): string {
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  return host ? `https://${host}` : "https://nhimbe.com";
}

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

export async function GET(request: Request): Promise<Response> {
  const workos = workosAuthMetadata();
  const origin = resourceOrigin(request);
  return metadata({
    resource: origin,
    authorization_servers: [workos.issuer],
    scopes_supported: ["openid", "profile", "email", "offline_access"],
    bearer_methods_supported: ["header"],
    resource_documentation: `${origin}/auth.md`,
  });
}
