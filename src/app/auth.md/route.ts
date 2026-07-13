// /auth.md — agent authentication guide (workos.com/auth-md).
// Served as text/markdown; the H1 contains "auth.md" per the spec so scanners
// recognise it. Describes how AI agents authenticate to nhimbe's protected
// APIs via WorkOS AuthKit bearer tokens.

export const dynamic = "force-static";

const AUTH_MD = `# auth.md

nhimbe is a community events discovery and management platform, part of the
Mukoko ecosystem by Nyuchi Web Services (https://nhimbe.com). AI agents
authenticate to nhimbe's protected APIs using WorkOS AuthKit bearer tokens:
present a WorkOS-issued access token (a JWT) in the \`Authorization: Bearer\`
header on write/protected requests.

## Discovery

Machine-readable authorization metadata is published at these well-known
endpoints:

- Authorization server metadata: https://nhimbe.com/.well-known/oauth-authorization-server
- Protected resource metadata: https://nhimbe.com/.well-known/oauth-protected-resource

## Authentication

nhimbe uses WorkOS AuthKit as its authorization server. To call protected
APIs, an agent first obtains a WorkOS AuthKit access token via the OAuth 2.1
authorization-code flow with PKCE:

1. Start authorization at the WorkOS authorize endpoint:
   \`https://identity.nyuchi.com/user_management/authorize\` (with a PKCE
   \`code_challenge\`).
2. Exchange the returned authorization code for tokens at the WorkOS token
   endpoint: \`https://identity.nyuchi.com/user_management/authenticate\` (supplying
   the PKCE \`code_verifier\`).
3. Call nhimbe APIs with the access token:
   \`Authorization: Bearer <token>\`.

Tokens are issued by WorkOS through nhimbe's custom auth domain (issuer
\`https://identity.nyuchi.com\`) and validated by nhimbe against the WorkOS JWKS
at \`https://identity.nyuchi.com/sso/jwks/client_01KQBBSMQTSMTBN7HEC9KQBJC0\`. The
WorkOS custom auth domain for nhimbe is https://identity.nyuchi.com.

## agent_auth

The \`register_uri\` below is the WorkOS AuthKit dynamic-client-registration
(DCR) endpoint, where agents can register an OAuth client before starting the
authorization flow.

\`\`\`yaml
resource: https://nhimbe.com
authorization_servers:
  - https://identity.nyuchi.com
scopes_supported: [openid, profile, email, offline_access]
bearer_methods_supported: [header]
agent_auth:
  skill: "Discover and register for community events on nhimbe"
  register_uri: https://identity.nyuchi.com/oauth2/register
  identity_types_supported: [identity_assertion]
  identity_assertion:
    assertion_types_supported: [urn:ietf:params:oauth:token-type:id-jag]
    credential_types_supported: [jwt]
\`\`\`
`;

export async function GET() {
  return new Response(AUTH_MD, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
