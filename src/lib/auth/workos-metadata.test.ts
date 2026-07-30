import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  workosApiHost,
  workosAuthkitDomain,
  workosClientId,
  workosMcpClientId,
  workosAuthMetadata,
} from "./workos-metadata";

/**
 * The published discovery documents describe the AuthKit **OAuth 2.1
 * authorization server** (`WORKOS_AUTHKIT_DOMAIN`, `identity.nyuchi.com` in
 * production) — the host that actually serves authorize/token/register/JWKS and
 * its own `/.well-known/oauth-authorization-server`. The bearer-token verifier
 * reads JWKS from the WorkOS **API** domain (`WORKOS_API_HOSTNAME`) instead; that
 * split is safe because a WorkOS environment signs every access token with one
 * key, published (same `kid`) at both hosts. These tests lock the two domains to
 * their distinct roles.
 */
describe("workos-metadata (AuthKit OAuth2 discovery)", () => {
  const original = { ...process.env };

  beforeEach(() => {
    delete process.env.WORKOS_CLIENT_ID;
    delete process.env.WORKOS_MCP_CLIENT_ID;
    delete process.env.WORKOS_API_HOSTNAME;
    delete process.env.WORKOS_AUTHKIT_DOMAIN;
  });

  afterEach(() => {
    process.env = { ...original };
  });

  it("defaults the API host to api.workos.com when WORKOS_API_HOSTNAME is unset", () => {
    expect(workosApiHost()).toBe("api.workos.com");
  });

  it("uses the custom API domain when WORKOS_API_HOSTNAME is set", () => {
    process.env.WORKOS_API_HOSTNAME = "authenticate.nyuchi.com";
    expect(workosApiHost()).toBe("authenticate.nyuchi.com");
  });

  it("defaults the AuthKit domain to identity.nyuchi.com, overridable via env", () => {
    expect(workosAuthkitDomain()).toBe("identity.nyuchi.com");
    process.env.WORKOS_AUTHKIT_DOMAIN = "example.authkit.app";
    expect(workosAuthkitDomain()).toBe("example.authkit.app");
  });

  it("normalises a WORKOS_AUTHKIT_DOMAIN supplied with a scheme and/or trailing slash", () => {
    process.env.WORKOS_AUTHKIT_DOMAIN = "https://identity.nyuchi.com/";
    expect(workosAuthkitDomain()).toBe("identity.nyuchi.com");
    // and the built endpoints don't double the scheme
    const m = workosAuthMetadata();
    expect(m.issuer).toBe("https://identity.nyuchi.com");
    expect(m.registrationEndpoint).toBe("https://identity.nyuchi.com/oauth2/register");
  });

  it("reads the client id from WORKOS_CLIENT_ID (empty when unset)", () => {
    expect(workosClientId()).toBe("");
    process.env.WORKOS_CLIENT_ID = "client_ABC";
    expect(workosClientId()).toBe("client_ABC");
  });

  it("builds the OAuth 2.1 endpoints on the AuthKit domain", () => {
    const m = workosAuthMetadata();
    expect(m.issuer).toBe("https://identity.nyuchi.com");
    expect(m.authorizationEndpoint).toBe("https://identity.nyuchi.com/oauth2/authorize");
    expect(m.tokenEndpoint).toBe("https://identity.nyuchi.com/oauth2/token");
    expect(m.registrationEndpoint).toBe("https://identity.nyuchi.com/oauth2/register");
    expect(m.jwksUri).toBe("https://identity.nyuchi.com/oauth2/jwks");
  });

  it("honours WORKOS_AUTHKIT_DOMAIN across every advertised endpoint", () => {
    process.env.WORKOS_AUTHKIT_DOMAIN = "example.authkit.app";
    const m = workosAuthMetadata();
    expect(m.issuer).toBe("https://example.authkit.app");
    expect(m.authorizationEndpoint).toBe("https://example.authkit.app/oauth2/authorize");
    expect(m.tokenEndpoint).toBe("https://example.authkit.app/oauth2/token");
    expect(m.registrationEndpoint).toBe("https://example.authkit.app/oauth2/register");
    expect(m.jwksUri).toBe("https://example.authkit.app/oauth2/jwks");
  });

  it("carries the verifier's client id for reference without leaking a hardcoded literal", () => {
    process.env.WORKOS_CLIENT_ID = "client_XYZ";
    const m = workosAuthMetadata();
    expect(m.clientId).toBe("client_XYZ");
    expect(m.jwksUri).not.toContain("client_01KQBBSMQTSMTBN7HEC9KQBJC0");
  });

  it("defaults the MCP client id to the app's own login client (one WorkOS Application, no separate MCP client)", () => {
    process.env.WORKOS_CLIENT_ID = "client_APP";
    expect(workosMcpClientId()).toBe("client_APP");
    // Still overridable per environment, for any non-MCP integration that
    // genuinely wants a distinct client.
    process.env.WORKOS_MCP_CLIENT_ID = "client_MCP";
    expect(workosMcpClientId()).toBe("client_MCP");
    expect(workosAuthMetadata().clientId).toBe("client_APP");
    expect(workosAuthMetadata({ mcp: true }).clientId).toBe("client_MCP");
  });
});
