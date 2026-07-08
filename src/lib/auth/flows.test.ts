import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// `flows.ts` guards itself with `import "server-only"`, which throws outside a
// React Server environment. Stub it so the module can load under vitest.
vi.mock("server-only", () => ({}));

// Mock the WorkOS SDK surface the flows touch. `getAuthorizationUrl` echoes its
// options so tests can assert on the provider/org mapping; `listOrganizations`
// is programmable per test.
const getAuthorizationUrl = vi.fn(
  (opts: Record<string, unknown>) => `https://workos.test/authorize?${JSON.stringify(opts)}`,
);
const listOrganizations = vi.fn();

vi.mock("@workos-inc/authkit-nextjs", () => ({
  getWorkOS: () => ({
    userManagement: { getAuthorizationUrl },
    organizations: { listOrganizations },
  }),
}));

import { isProvider, safeReturnTo, socialAuthUrl, ssoAuthUrlForEmail } from "./flows";

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  vi.clearAllMocks();
  process.env.WORKOS_CLIENT_ID = "client_test";
  process.env.NEXT_PUBLIC_WORKOS_REDIRECT_URI = "https://nhimbe.com/callback";
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("isProvider", () => {
  it("accepts supported providers", () => {
    expect(isProvider("google")).toBe(true);
    expect(isProvider("microsoft")).toBe(true);
  });

  it("rejects anything else", () => {
    expect(isProvider("apple")).toBe(false);
    expect(isProvider("")).toBe(false);
    expect(isProvider("GoogleOAuth")).toBe(false);
  });
});

describe("safeReturnTo", () => {
  it("keeps local absolute paths", () => {
    expect(safeReturnTo("/events/123")).toBe("/events/123");
    expect(safeReturnTo("/")).toBe("/");
  });

  it("falls back to / for unsafe or empty values", () => {
    expect(safeReturnTo(null)).toBe("/");
    expect(safeReturnTo(undefined)).toBe("/");
    expect(safeReturnTo("")).toBe("/");
    expect(safeReturnTo("//evil.example")).toBe("/");
    expect(safeReturnTo("/\\evil.example")).toBe("/");
    expect(safeReturnTo("https://evil.example")).toBe("/");
    expect(safeReturnTo("relative/path")).toBe("/");
  });
});

describe("socialAuthUrl", () => {
  it("maps google → GoogleOAuth", () => {
    const url = socialAuthUrl("google", "/events");
    expect(url).toContain("https://workos.test/authorize");
    const opts = getAuthorizationUrl.mock.calls[0][0];
    expect(opts).toMatchObject({
      clientId: "client_test",
      redirectUri: "https://nhimbe.com/callback",
      provider: "GoogleOAuth",
    });
    expect(typeof opts.state).toBe("string");
  });

  it("maps microsoft → MicrosoftOAuth", () => {
    socialAuthUrl("microsoft", "/");
    expect(getAuthorizationUrl.mock.calls[0][0]).toMatchObject({ provider: "MicrosoftOAuth" });
  });

  it("returns null when env is missing", () => {
    delete process.env.WORKOS_CLIENT_ID;
    expect(socialAuthUrl("google", "/")).toBeNull();
    expect(getAuthorizationUrl).not.toHaveBeenCalled();
  });
});

describe("ssoAuthUrlForEmail", () => {
  it("builds an SSO URL for a domain with a matching org", async () => {
    listOrganizations.mockResolvedValue({ data: [{ id: "org_123" }] });
    const result = await ssoAuthUrlForEmail("worker@acme.com", "/dashboard");
    expect(result.status).toBe("ok");
    expect(listOrganizations).toHaveBeenCalledWith({ domains: ["acme.com"], limit: 1 });
    expect(getAuthorizationUrl.mock.calls[0][0]).toMatchObject({ organizationId: "org_123" });
  });

  it("returns not-found when no org matches the domain", async () => {
    listOrganizations.mockResolvedValue({ data: [] });
    const result = await ssoAuthUrlForEmail("nobody@nowhere.com", "/");
    expect(result.status).toBe("not-found");
    expect(getAuthorizationUrl).not.toHaveBeenCalled();
  });

  it("rejects invalid emails without calling WorkOS", async () => {
    const result = await ssoAuthUrlForEmail("not-an-email", "/");
    expect(result.status).toBe("invalid-email");
    expect(listOrganizations).not.toHaveBeenCalled();
  });

  it("returns config when env is missing", async () => {
    delete process.env.NEXT_PUBLIC_WORKOS_REDIRECT_URI;
    const result = await ssoAuthUrlForEmail("worker@acme.com", "/");
    expect(result.status).toBe("config");
  });

  it("returns error when the org lookup throws", async () => {
    listOrganizations.mockRejectedValue(new Error("boom"));
    const result = await ssoAuthUrlForEmail("worker@acme.com", "/");
    expect(result.status).toBe("error");
  });
});
