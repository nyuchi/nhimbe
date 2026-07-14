/**
 * requireAdmin gate — the extracted contract, unit-tested without AuthKit or
 * the cluster: anonymous handling belongs to withAuth (mocked), everything
 * else (role hierarchy, suspension, lookup failure, deny target) is asserted
 * here.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const withAuth = vi.fn();
vi.mock("@workos-inc/authkit-nextjs", () => ({
  withAuth: (...args: unknown[]) => withAuth(...args),
}));

const getPersonByWorkosId = vi.fn();
vi.mock("@/lib/mongo/users", () => ({
  getPersonByWorkosId: (...args: unknown[]) => getPersonByWorkosId(...args),
}));

// The org gate is exercised in full by workos-org.test.ts; here it is mocked
// so we can assert require-admin LAYERS role on top of org membership.
const requireNyuchiOrgMembership = vi.fn();
vi.mock("./workos-org", () => ({
  requireNyuchiOrgMembership: (...args: unknown[]) =>
    requireNyuchiOrgMembership(...args),
}));

import { requireAdmin, resolveAdminGate, hasRole, normaliseRole } from "./require-admin";

const WORKOS_USER = { id: "workos_user_123", email: "admin@nhimbe.com" };

function person(overrides: Record<string, unknown> = {}) {
  return {
    personId: "person-1",
    role: "admin",
    suspended: false,
    ...overrides,
  };
}

beforeEach(() => {
  withAuth.mockResolvedValue({
    user: WORKOS_USER,
    accessToken: "token-abc",
    organizationId: "org_nyuchi",
  });
  // Default: the requester is an active member of the nyuchi org, so the
  // existing role-gate tests below assert role behaviour in isolation.
  requireNyuchiOrgMembership.mockResolvedValue("org_nyuchi");
});

describe("resolveAdminGate (pure deny semantics)", () => {
  it("denies a missing person", () => {
    expect(resolveAdminGate(null, "admin")).toBeNull();
  });

  it("denies a suspended account regardless of role", () => {
    expect(resolveAdminGate(person({ role: "super_admin", suspended: true }), "admin")).toBeNull();
  });

  it("denies an inactive account (isActive === false) regardless of role", () => {
    // Suspension is decoupled from role — the suspend action flips isActive and
    // leaves role intact, so the gate must reject on isActive alone.
    expect(
      resolveAdminGate(person({ role: "super_admin", suspended: false, isActive: false }), "admin"),
    ).toBeNull();
  });

  it("passes an active account at/above the required role", () => {
    expect(resolveAdminGate(person({ role: "admin", isActive: true }), "admin")).toBe("admin");
  });

  it("denies below the required role and passes at/above it", () => {
    expect(resolveAdminGate(person({ role: "user" }), "admin")).toBeNull();
    expect(resolveAdminGate(person({ role: "moderator" }), "admin")).toBeNull();
    expect(resolveAdminGate(person({ role: "admin" }), "admin")).toBe("admin");
    expect(resolveAdminGate(person({ role: "super_admin" }), "admin")).toBe("super_admin");
    expect(resolveAdminGate(person({ role: "moderator" }), "moderator")).toBe("moderator");
  });

  it("treats unknown/absent roles as plain user", () => {
    expect(resolveAdminGate(person({ role: "owner" }), "admin")).toBeNull();
    expect(resolveAdminGate(person({ role: null }), "moderator")).toBeNull();
    expect(normaliseRole("nonsense")).toBe("user");
  });
});

describe("requireAdmin", () => {
  it("resolves the session with ensureSignedIn (anonymous → hosted sign-in)", async () => {
    getPersonByWorkosId.mockResolvedValue(person());
    await requireAdmin();
    expect(withAuth).toHaveBeenCalledWith({ ensureSignedIn: true });
  });

  it("returns the requester for an admin", async () => {
    getPersonByWorkosId.mockResolvedValue(person());
    await expect(requireAdmin()).resolves.toEqual({
      workosUserId: "workos_user_123",
      personId: "person-1",
      role: "admin",
      accessToken: "token-abc",
    });
    expect(getPersonByWorkosId).toHaveBeenCalledWith("workos_user_123");
  });

  it("passes the AuthKit session org id through to the org gate", async () => {
    getPersonByWorkosId.mockResolvedValue(person());
    await requireAdmin();
    expect(requireNyuchiOrgMembership).toHaveBeenCalledWith({
      workosUserId: "workos_user_123",
      sessionOrganizationId: "org_nyuchi",
    });
  });

  it("denies an authenticated user who is NOT in the nyuchi org — regardless of role", async () => {
    // A bona fide super_admin who is not an org member is still denied.
    getPersonByWorkosId.mockResolvedValue(person({ role: "super_admin" }));
    requireNyuchiOrgMembership.mockResolvedValue(null);
    await expect(requireAdmin()).rejects.toThrow("NEXT_REDIRECT:/denied");
  });

  it("denies non-members BEFORE the identity.persons lookup (org gate first)", async () => {
    requireNyuchiOrgMembership.mockResolvedValue(null);
    await expect(requireAdmin()).rejects.toThrow("NEXT_REDIRECT:/denied");
    expect(getPersonByWorkosId).not.toHaveBeenCalled();
  });

  it("denies (fail-closed) when the org gate can't resolve the org", async () => {
    // requireNyuchiOrgMembership returns null on an unresolvable org / WorkOS error.
    getPersonByWorkosId.mockResolvedValue(person());
    requireNyuchiOrgMembership.mockResolvedValue(null);
    await expect(requireAdmin()).rejects.toThrow("NEXT_REDIRECT:/denied");
  });

  it("still enforces role tiers for a bona fide org member", async () => {
    // Org member, but only a plain user → denied by the role gate.
    getPersonByWorkosId.mockResolvedValue(person({ role: "user" }));
    await expect(requireAdmin()).rejects.toThrow("NEXT_REDIRECT:/denied");
  });

  it("redirects a plain user to /denied", async () => {
    getPersonByWorkosId.mockResolvedValue(person({ role: "user" }));
    await expect(requireAdmin()).rejects.toThrow("NEXT_REDIRECT:/denied");
  });

  it("redirects a moderator to /denied at the default (admin) gate", async () => {
    getPersonByWorkosId.mockResolvedValue(person({ role: "moderator" }));
    await expect(requireAdmin()).rejects.toThrow("NEXT_REDIRECT:/denied");
  });

  it("lets a moderator through a moderator-level gate (shell layout)", async () => {
    getPersonByWorkosId.mockResolvedValue(person({ role: "moderator" }));
    await expect(requireAdmin("moderator")).resolves.toMatchObject({ role: "moderator" });
  });

  it("redirects a suspended admin to /denied", async () => {
    getPersonByWorkosId.mockResolvedValue(person({ suspended: true }));
    await expect(requireAdmin()).rejects.toThrow("NEXT_REDIRECT:/denied");
  });

  it("redirects an unknown person (no identity.persons doc) to /denied", async () => {
    getPersonByWorkosId.mockResolvedValue(null);
    await expect(requireAdmin()).rejects.toThrow("NEXT_REDIRECT:/denied");
  });

  it("treats a role-lookup failure as forbidden", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    getPersonByWorkosId.mockRejectedValue(new Error("cluster wobbly"));
    await expect(requireAdmin()).rejects.toThrow("NEXT_REDIRECT:/denied");
    consoleError.mockRestore();
  });

  it("enforces the super_admin gate for settings-level access", async () => {
    getPersonByWorkosId.mockResolvedValue(person({ role: "admin" }));
    await expect(requireAdmin("super_admin")).rejects.toThrow("NEXT_REDIRECT:/denied");
    expect(hasRole("super_admin", "admin")).toBe(true);
  });
});

describe("requireAdmin local dev bypass", () => {
  it("grants the synthetic dev super_admin without AuthKit when enabled", async () => {
    vi.stubEnv("DEV_AUTH_BYPASS", "1");
    try {
      await expect(requireAdmin()).resolves.toMatchObject({
        workosUserId: "dev-local-bypass",
        role: "super_admin",
      });
      expect(withAuth).not.toHaveBeenCalled();
      expect(getPersonByWorkosId).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("still runs the real deny path — DEV_AUTH_ROLE=user is bounced to /denied", async () => {
    vi.stubEnv("DEV_AUTH_BYPASS", "1");
    vi.stubEnv("DEV_AUTH_ROLE", "user");
    try {
      await expect(requireAdmin()).rejects.toThrow("NEXT_REDIRECT:/denied");
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
