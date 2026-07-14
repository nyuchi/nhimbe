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
  withAuth.mockResolvedValue({ user: WORKOS_USER, accessToken: "token-abc" });
});

describe("resolveAdminGate (pure deny semantics)", () => {
  it("denies a missing person", () => {
    expect(resolveAdminGate(null, "admin")).toBeNull();
  });

  it("denies a suspended account regardless of role", () => {
    expect(resolveAdminGate(person({ role: "super_admin", suspended: true }), "admin")).toBeNull();
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
