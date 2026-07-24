// OAuth 2.0 Protected Resource Metadata (RFC 9728)
// https://www.rfc-editor.org/rfc/rfc9728
//
// nhimbe is a RESOURCE SERVER: its APIs are protected by WorkOS AuthKit-issued
// JWTs. This endpoint lets agents/clients discover which authorization server(s)
// issue the tokens accepted here, plus supported scopes and bearer methods.
// Served statically at /.well-known/oauth-protected-resource.

import { workosAuthMetadata } from "@/lib/auth/workos-metadata";
import { SITE_URL } from "@/lib/site-url";

// force-dynamic: the authorization server is derived at request time from the
// same runtime env (WORKOS_API_HOSTNAME) the verifier uses, so it always matches
// the AS metadata doc. Cached 1h below.
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
    resource: SITE_URL,
    authorization_servers: [workos.issuer],
    scopes_supported: ["openid", "profile", "email", "offline_access"],
    bearer_methods_supported: ["header"],
    resource_documentation: `${SITE_URL}/auth.md`,
  });
}
