// /auth.md — agent authentication guide (workos.com/auth-md).
// Served as text/markdown; the H1 contains "auth.md" per the spec so scanners
// recognise it. Describes how AI agents authenticate to nhimbe's protected
// APIs via WorkOS AuthKit bearer tokens.

import { workosAuthMetadata } from "@/lib/auth/workos-metadata";
import { SITE_URL } from "@/lib/site-url";

// force-dynamic: derived at request time from runtime env (WORKOS_AUTHKIT_DOMAIN)
// so the authorize/token/register/JWKS endpoints advertised here always point at
// the live AuthKit OAuth 2.1 authorization server. Cached 1h.
export const dynamic = "force-dynamic";

function buildAuthMd(): string {
  const workos = workosAuthMetadata();
  return `# auth.md

Nhimbe is a community events discovery and management platform, part of the
Mukoko ecosystem by Nyuchi Web Services (${SITE_URL}). AI agents
authenticate to Nhimbe's protected APIs using WorkOS AuthKit bearer tokens:
present a WorkOS-issued access token (a JWT) in the \`Authorization: Bearer\`
header on write/protected requests.

## Discovery

Machine-readable authorization metadata is published at these well-known
endpoints:

- Authorization server metadata: ${SITE_URL}/.well-known/oauth-authorization-server
- Protected resource metadata: ${SITE_URL}/.well-known/oauth-protected-resource

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

## Connect the Mukoko Events MCP

The Mukoko Events MCP server is served at \`https://events.mukoko.com/mcp\` and
speaks the same WorkOS AuthKit OAuth 2.1 flow described above. MCP clients don't
build the flow by hand — they run the standard discovery chain, and the human
signs in once through the hosted AuthKit UI:

1. The client requests \`https://events.mukoko.com/mcp\` unauthenticated and gets
   \`401 Unauthorized\` with a \`WWW-Authenticate: Bearer\` header whose
   \`resource_metadata\` points at
   \`${SITE_URL}/.well-known/oauth-protected-resource\` (RFC 9728).
2. That protected-resource document names the authorization server
   (\`${workos.issuer}\`), whose metadata
   (\`${SITE_URL}/.well-known/oauth-authorization-server\`) advertises the
   authorize, token, JWKS and dynamic-client-registration endpoints below.
3. The client self-registers via DCR (\`${workos.registrationEndpoint}\`), then
   runs the authorization-code + PKCE flow. The user completes sign-in in the
   hosted AuthKit UI (email code, password, passkey, MFA or social — all
   configured in WorkOS), and the client stores the returned tokens.

Once authorized, the client reuses the access token (refreshing via
\`offline_access\`) on every MCP call — there is no second sign-in.

**In Claude (web or desktop):** open Settings → Connectors → Add custom
connector, enter \`https://events.mukoko.com/mcp\`, click Connect, and complete
the WorkOS sign-in when prompted. The connector is then available in new chats.

## agent_auth

The \`register_uri\` below is the WorkOS AuthKit dynamic-client-registration
(DCR) endpoint, where agents can register an OAuth client before starting the
authorization flow.

\`\`\`yaml
resource: ${SITE_URL}
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
