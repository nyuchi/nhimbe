import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { workosApiHost, workosClientId, workosAuthMetadata } from "./workos-metadata";

/**
 * These tests lock the published discovery metadata to the SAME derivation the
 * bearer-token verifier uses (`workos-token.ts` → `jwksUrl()`:
 * `https://${WORKOS_API_HOSTNAME || "api.workos.com"}/sso/jwks/${WORKOS_CLIENT_ID}`).
 * If this drifts, MCP writes 401 because agents follow discovery to a different
 * client id / host than the app verifies against.
 */
describe("workos-metadata (discovery ↔ verification parity)", () => {
  const original = { ...process.env };

  beforeEach(() => {
    delete process.env.WORKOS_CLIENT_ID;
    delete process.env.WORKOS_API_HOSTNAME;
  });

  afterEach(() => {
    process.env = { ...original };
  });

  it("defaults the host to api.workos.com when WORKOS_API_HOSTNAME is unset", () => {
    expect(workosApiHost()).toBe("api.workos.com");
  });

  it("uses the custom API domain when WORKOS_API_HOSTNAME is set", () => {
    process.env.WORKOS_API_HOSTNAME = "authenticate.nyuchi.com";
    expect(workosApiHost()).toBe("authenticate.nyuchi.com");
  });

  it("reads the client id from WORKOS_CLIENT_ID (empty when unset)", () => {
    expect(workosClientId()).toBe("");
    process.env.WORKOS_CLIENT_ID = "client_ABC";
    expect(workosClientId()).toBe("client_ABC");
  });

  it("builds the JWKS URL exactly as the token verifier does", () => {
    process.env.WORKOS_CLIENT_ID = "client_ABC";
    process.env.WORKOS_API_HOSTNAME = "authenticate.nyuchi.com";
    const { jwksUri } = workosAuthMetadata();
    // Must match workos-token.ts jwksUrl(): https://${host}/sso/jwks/${clientId}
    expect(jwksUri).toBe("https://authenticate.nyuchi.com/sso/jwks/client_ABC");
  });

  it("keeps issuer, authorize, token, and JWKS on ONE host + client id", () => {
    process.env.WORKOS_CLIENT_ID = "client_XYZ";
    process.env.WORKOS_API_HOSTNAME = "authenticate.nyuchi.com";
    const m = workosAuthMetadata();
    expect(m.issuer).toBe("https://authenticate.nyuchi.com");
    expect(m.authorizationEndpoint).toBe("https://authenticate.nyuchi.com/user_management/authorize");
    expect(m.tokenEndpoint).toBe("https://authenticate.nyuchi.com/user_management/authenticate");
    expect(m.registrationEndpoint).toBe("https://authenticate.nyuchi.com/oauth2/register");
    // The JWKS client id is the one selector that must match the verifier.
    expect(m.jwksUri).toContain(m.clientId);
    expect(m.clientId).toBe("client_XYZ");
    // No hardcoded literal survives.
    expect(m.jwksUri).not.toContain("client_01KQBBSMQTSMTBN7HEC9KQBJC0");
  });
});
