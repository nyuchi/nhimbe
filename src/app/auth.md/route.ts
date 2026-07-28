// /auth.md — agent authentication guide (workos.com/auth-md).
// Served as text/markdown; the H1 contains "auth.md" per the spec so scanners
// recognise it. Describes how AI agents authenticate to nhimbe's protected
// APIs via WorkOS AuthKit bearer tokens.

import { workosAuthMetadata } from "@/lib/auth/workos-metadata";

// force-dynamic: derived at request time from runtime env (WORKOS_AUTHKIT_DOMAIN)
// so the authorize/token/register/JWKS endpoints advertised here always point at
// the live AuthKit OAuth 2.1 authorization server. Cached 1h.
export const dynamic = "force-dynamic";

function buildAuthMd(): string {
  const workos = workosAuthMetadata();
  return `# auth.md

Nhimbe is a community events discovery and management platform, part of the
Mukoko ecosystem by Nyuchi Web Services (https://nhimbe.com). AI agents
authenticate to Nhimbe's protected APIs using WorkOS AuthKit bearer tokens:
present a WorkOS-issued access token (a JWT) in the \`Authorization: Bearer\`
header on write/protected requests.

## Discovery

Machine-readable authorization metadata is published at these well-known
endpoints:

- Authorization server metadata: https://nhimbe.com/.well-known/oauth-authorization-server
- Protected resource metadata: https://nhimbe.com/.well-known/oauth-protected-resource

## Authentication

Nhimbe uses WorkOS AuthKit as its authorization server. To call protected
APIs, an agent first obtains a WorkOS AuthKit access token via the OAuth 2.1
authorization-code flow with PKCE:

1. Start authorization at the AuthKit authorize endpoint:
   \`${workos.authorizationEndpoint}\` (with a PKCE \`code_challenge\`).
2. Exchange the returned authorization code for tokens at the AuthKit token
   endpoint: \`${workos.tokenEndpoint}\` (supplying the PKCE \`code_verifier\`).
3. Call Nhimbe APIs with the access token:
   \`Authorization: Bearer <token>\`.

Tokens are issued by the WorkOS AuthKit OAuth 2.1 authorization server
(\`${workos.issuer}\`) and validated by Nhimbe against the WorkOS JWKS
published at \`${workos.jwksUri}\`. Dynamic client registration is supported at
\`${workos.registrationEndpoint}\` (see below), so clients can self-register
before starting the flow.

## agent_auth

The \`register_uri\` below is the WorkOS AuthKit dynamic-client-registration
(DCR) endpoint, where agents can register an OAuth client before starting the
authorization flow.

\`\`\`yaml
resource: https://nhimbe.com
authorization_servers:
  - ${workos.issuer}
scopes_supported: [openid, profile, email, offline_access]
bearer_methods_supported: [header]
agent_auth:
  skill: "Discover and register for community events on Nhimbe"
  register_uri: ${workos.registrationEndpoint}
  identity_types_supported: [identity_assertion]
  identity_assertion:
    assertion_types_supported: [urn:ietf:params:oauth:token-type:id-jag]
    credential_types_supported: [jwt]
\`\`\`
`;
}

export async function GET() {
  return new Response(buildAuthMd(), {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
