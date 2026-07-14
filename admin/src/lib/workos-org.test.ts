/**
 * WorkOS org scoping — unit-tested without a live WorkOS. The SDK is mocked;
 * we assert org resolution (env override vs domain-resolve + caching), the
 * active-membership check, the pure gate decision, and — critically — the
 * fail-closed behaviour on every uncertainty.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const listOrganizations = vi.fn();
const listOrganizationMemberships = vi.fn();
vi.mock("@workos-inc/authkit-nextjs", () => ({
  getWorkOS: () => ({
    organizations: { listOrganizations: (...a: unknown[]) => listOrganizations(...a) },
    userManagement: {
      listOrganizationMemberships: (...a: unknown[]) => listOrganizationMemberships(...a),
    },
  }),
}));

import {
  resolveAllowedOrgId,
  hasActiveOrgMembership,
  decideOrgGate,
  requireNyuchiOrgMembership,
  __resetOrgCache,
  NYUCHI_ORG_DOMAIN,
} from "./workos-org";

beforeEach(() => {
  __resetOrgCache();
  vi.unstubAllEnvs();
  listOrganizations.mockReset();
  listOrganizationMemberships.mockReset();
});

describe("resolveAllowedOrgId", () => {
  it("prefers WORKOS_ADMIN_ORG_ID and never calls the SDK", async () => {
    vi.stubEnv("WORKOS_ADMIN_ORG_ID", "org_env_override");
    await expect(resolveAllowedOrgId()).resolves.toBe("org_env_override");
    expect(listOrganizations).not.toHaveBeenCalled();
  });

  it("trims whitespace around the env value", async () => {
    vi.stubEnv("WORKOS_ADMIN_ORG_ID", "  org_env_override  ");
    await expect(resolveAllowedOrgId()).resolves.toBe("org_env_override");
  });

  it("resolves by nyuchi.com domain when the env is unset", async () => {
    listOrganizations.mockResolvedValue({ data: [{ id: "org_by_domain" }] });
    await expect(resolveAllowedOrgId()).resolves.toBe("org_by_domain");
    expect(listOrganizations).toHaveBeenCalledWith({
      domains: [NYUCHI_ORG_DOMAIN],
      limit: 1,
    });
  });

  it("caches a positive domain resolution (SDK called once)", async () => {
    listOrganizations.mockResolvedValue({ data: [{ id: "org_by_domain" }] });
    await resolveAllowedOrgId();
    await resolveAllowedOrgId();
    expect(listOrganizations).toHaveBeenCalledTimes(1);
  });

  it("returns null (deny) when no org matches the domain", async () => {
    listOrganizations.mockResolvedValue({ data: [] });
    await expect(resolveAllowedOrgId()).resolves.toBeNull();
  });

  it("fails closed and does NOT cache when the lookup throws", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    listOrganizations.mockRejectedValueOnce(new Error("workos down"));
    await expect(resolveAllowedOrgId()).resolves.toBeNull();
    // A later success recovers — the failure was never memoised.
    listOrganizations.mockResolvedValueOnce({ data: [{ id: "org_recovered" }] });
    await expect(resolveAllowedOrgId()).resolves.toBe("org_recovered");
    spy.mockRestore();
  });
});

describe("hasActiveOrgMembership", () => {
  it("is true when an active membership exists", async () => {
    listOrganizationMemberships.mockResolvedValue({ data: [{ id: "om_1" }] });
    await expect(hasActiveOrgMembership("user_1", "org_1")).resolves.toBe(true);
    expect(listOrganizationMemberships).toHaveBeenCalledWith({
      userId: "user_1",
      organizationId: "org_1",
      statuses: ["active"],
      limit: 1,
    });
  });

  it("is false when there is no active membership", async () => {
    listOrganizationMemberships.mockResolvedValue({ data: [] });
    await expect(hasActiveOrgMembership("user_1", "org_1")).resolves.toBe(false);
  });

  it("fails closed (false) when the lookup throws", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    listOrganizationMemberships.mockRejectedValue(new Error("workos down"));
    await expect(hasActiveOrgMembership("user_1", "org_1")).resolves.toBe(false);
    spy.mockRestore();
  });
});

describe("decideOrgGate (pure)", () => {
  it("denies when the org is unresolved regardless of membership", () => {
    expect(decideOrgGate(null, true)).toBeNull();
    expect(decideOrgGate(null, false)).toBeNull();
  });

  it("passes an active member of a resolved org", () => {
    expect(decideOrgGate("org_1", true)).toBe("org_1");
  });

  it("denies a non-member of a resolved org", () => {
    expect(decideOrgGate("org_1", false)).toBeNull();
  });
});

describe("requireNyuchiOrgMembership", () => {
  it("passes an active member (env-resolved org)", async () => {
    vi.stubEnv("WORKOS_ADMIN_ORG_ID", "org_nyuchi");
    listOrganizationMemberships.mockResolvedValue({ data: [{ id: "om_1" }] });
    await expect(
      requireNyuchiOrgMembership({ workosUserId: "user_1" }),
    ).resolves.toBe("org_nyuchi");
    expect(listOrganizations).not.toHaveBeenCalled();
  });

  it("passes an active member (domain-resolved org)", async () => {
    listOrganizations.mockResolvedValue({ data: [{ id: "org_by_domain" }] });
    listOrganizationMemberships.mockResolvedValue({ data: [{ id: "om_1" }] });
    await expect(
      requireNyuchiOrgMembership({ workosUserId: "user_1" }),
    ).resolves.toBe("org_by_domain");
  });

  it("denies an authenticated user who is NOT in the org", async () => {
    vi.stubEnv("WORKOS_ADMIN_ORG_ID", "org_nyuchi");
    listOrganizationMemberships.mockResolvedValue({ data: [] });
    await expect(
      requireNyuchiOrgMembership({ workosUserId: "outsider" }),
    ).resolves.toBeNull();
  });

  it("denies (fail-closed) when the org can't be resolved", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    listOrganizations.mockRejectedValue(new Error("workos down"));
    await expect(
      requireNyuchiOrgMembership({ workosUserId: "user_1" }),
    ).resolves.toBeNull();
    // Membership was never even queried — the org gate short-circuited.
    expect(listOrganizationMemberships).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("the API check overrides a stale session org (denies a non-member)", async () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubEnv("WORKOS_ADMIN_ORG_ID", "org_nyuchi");
    listOrganizationMemberships.mockResolvedValue({ data: [] });
    await expect(
      requireNyuchiOrgMembership({
        workosUserId: "user_1",
        sessionOrganizationId: "org_nyuchi",
      }),
    ).resolves.toBeNull();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
