/**
 * Admin people/event mutations — RBAC and input-validation contract.
 *
 * Asserts the three security fixes without AuthKit or the cluster:
 *  - the super_admin guard on suspend/activate (a plain admin cannot suspend
 *    or reactivate an elevated account);
 *  - suspension is decoupled from role (suspend flips isActive only, leaving
 *    role intact; reactivate restores access without touching role);
 *  - action inputs are runtime-validated (operator objects are rejected before
 *    they can reach a Mongo filter/update).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

// The list reads pull in the shared Mongo layer (server-only) — stub the whole
// module so importing the actions file stays cheap and cluster-free.
vi.mock("@/lib/mongo/admin", () => ({
  listAdminUsers: vi.fn(),
  listAdminEvents: vi.fn(),
  listAdminEntities: vi.fn(),
  listAdminEntityMembers: vi.fn(),
  listAdminCircles: vi.fn(),
  listAdminCalendars: vi.fn(),
  listSupportTickets: vi.fn(),
}));

const findOne = vi.fn();
const personsUpdateOne = vi.fn();
const eventsUpdateOne = vi.fn();
vi.mock("@/lib/mongo/databases", () => ({
  personsCollection: vi.fn(async () => ({ findOne, updateOne: personsUpdateOne })),
  eventsCollection: vi.fn(async () => ({ updateOne: eventsUpdateOne })),
}));

const requireAdmin = vi.fn();
vi.mock("@admin/lib/require-admin", () => ({
  requireAdmin: (...args: unknown[]) => requireAdmin(...args),
}));

import {
  suspendUser,
  activateUser,
  setUserRole,
  moderateEvent,
  setEventFeatured,
} from "./admin";

const DENIED = "NEXT_REDIRECT:/denied";

/** Model the gate: base requireAdmin() returns the actor; the super_admin
 *  escalation denies (redirect-throws) unless the actor is super_admin. */
function gateAs(actorRole: "admin" | "super_admin") {
  requireAdmin.mockImplementation((required?: string) => {
    if (required === "super_admin" && actorRole !== "super_admin") {
      throw new Error(DENIED);
    }
    return { role: actorRole, personId: "actor", workosUserId: "w", accessToken: "" };
  });
}

/** The target person the action loads before deciding. */
function targetRole(role: string) {
  findOne.mockResolvedValue({ _id: "target", role });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("suspendUser — super_admin guard + isActive decoupling", () => {
  it("DENIES a plain admin suspending a super_admin (no write)", async () => {
    gateAs("admin");
    targetRole("super_admin");
    await expect(suspendUser("target")).rejects.toThrow(DENIED);
    expect(personsUpdateOne).not.toHaveBeenCalled();
  });

  it("DENIES a plain admin suspending another admin", async () => {
    gateAs("admin");
    targetRole("admin");
    await expect(suspendUser("target")).rejects.toThrow(DENIED);
    expect(personsUpdateOne).not.toHaveBeenCalled();
  });

  it("allows a super_admin to suspend a super_admin", async () => {
    gateAs("super_admin");
    targetRole("super_admin");
    await expect(suspendUser("target")).resolves.toEqual({ message: "ok" });
    expect(personsUpdateOne).toHaveBeenCalledTimes(1);
  });

  it("allows a plain admin to suspend a plain user", async () => {
    gateAs("admin");
    targetRole("user");
    await expect(suspendUser("target")).resolves.toEqual({ message: "ok" });
  });

  it("suspend sets isActive:false and NEVER writes role (no clobber)", async () => {
    gateAs("super_admin");
    targetRole("admin");
    await suspendUser("target");
    const [, update] = personsUpdateOne.mock.calls[0];
    expect(update.$set.isActive).toBe(false);
    expect(update.$set).not.toHaveProperty("role");
  });
});

describe("activateUser — super_admin guard + role preserved", () => {
  it("DENIES a plain admin reactivating an admin (no write)", async () => {
    gateAs("admin");
    targetRole("admin");
    await expect(activateUser("target")).rejects.toThrow(DENIED);
    expect(personsUpdateOne).not.toHaveBeenCalled();
  });

  it("reactivate sets isActive:true and preserves the original role", async () => {
    gateAs("super_admin");
    targetRole("admin");
    await activateUser("target");
    const [, update] = personsUpdateOne.mock.calls[0];
    expect(update.$set.isActive).toBe(true);
    expect(update.$set).not.toHaveProperty("role");
  });
});

describe("setUserRole — elevation guard", () => {
  it("DENIES a plain admin granting admin", async () => {
    gateAs("admin");
    targetRole("user");
    await expect(setUserRole("target", "admin")).rejects.toThrow(DENIED);
    expect(personsUpdateOne).not.toHaveBeenCalled();
  });

  it("DENIES a plain admin demoting an existing super_admin", async () => {
    gateAs("admin");
    targetRole("super_admin");
    await expect(setUserRole("target", "user")).rejects.toThrow(DENIED);
  });

  it("allows a plain admin to set a plain user to moderator", async () => {
    gateAs("admin");
    targetRole("user");
    await expect(setUserRole("target", "moderator")).resolves.toEqual({ message: "ok" });
    const [, update] = personsUpdateOne.mock.calls[0];
    expect(update.$set.role).toBe("moderator");
  });

  it("rejects an unknown role", async () => {
    gateAs("super_admin");
    targetRole("user");
    await expect(setUserRole("target", "root")).rejects.toThrow(/unknown role/);
  });
});

describe("input validation — operator-injection is rejected", () => {
  beforeEach(() => {
    gateAs("super_admin");
    targetRole("user");
  });

  it("rejects a non-string userId ({$ne:null})", async () => {
    await expect(
      suspendUser({ $ne: null } as unknown as string),
    ).rejects.toThrow(/must be a non-empty string/);
    expect(personsUpdateOne).not.toHaveBeenCalled();
  });

  it("rejects a non-string userId on setUserRole ({$gt:''})", async () => {
    await expect(
      setUserRole({ $gt: "" } as unknown as string, "admin"),
    ).rejects.toThrow(/must be a non-empty string/);
  });

  it("rejects an empty-string userId", async () => {
    await expect(activateUser("")).rejects.toThrow(/must be a non-empty string/);
  });

  it("rejects a non-string eventId on moderateEvent", async () => {
    await expect(
      moderateEvent({ $ne: null } as unknown as string),
    ).rejects.toThrow(/must be a non-empty string/);
    expect(eventsUpdateOne).not.toHaveBeenCalled();
  });

  it("rejects a non-boolean featured flag on setEventFeatured", async () => {
    await expect(
      setEventFeatured("evt", "true" as unknown as boolean),
    ).rejects.toThrow(/must be a boolean/);
  });
});
