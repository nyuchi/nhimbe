/**
 * Nyuchi entity-membership gate — exercised without the cluster: the Mongo
 * collection accessors are mocked, everything else (env short-circuit,
 * positive-only caching, staff-role filter, fail-closed error handling, pure
 * decision) is asserted here.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("server-only", () => ({}));

const entityFindOne = vi.fn();
const membershipFindOne = vi.fn();
vi.mock("@/lib/mongo/databases", () => ({
  entitiesCollection: async () => ({ findOne: entityFindOne }),
  entityMembershipsCollection: async () => ({ findOne: membershipFindOne }),
}));

import {
  ADMIN_MEMBERSHIP_ROLES,
  NYUCHI_ENTITY_SLUG,
  __resetEntityCache,
  decideMembershipGate,
  hasActiveNyuchiMembership,
  requireNyuchiMembership,
  resolveNyuchiEntityId,
} from "./nyuchi-membership";

const ENTITY_ID = "0192e000-c000-7000-8000-000000000003";
const PERSON_ID = "person-1";

beforeEach(() => {
  __resetEntityCache();
  entityFindOne.mockResolvedValue({ _id: ENTITY_ID });
  membershipFindOne.mockResolvedValue({ _id: "membership-1" });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("resolveNyuchiEntityId", () => {
  it("short-circuits to NYUCHI_ADMIN_ENTITY_ID when set (no lookup)", async () => {
    vi.stubEnv("NYUCHI_ADMIN_ENTITY_ID", "entity-from-env");
    await expect(resolveNyuchiEntityId()).resolves.toBe("entity-from-env");
    expect(entityFindOne).not.toHaveBeenCalled();
  });

  it("resolves by the nyuchi-africa slug and caches the positive hit", async () => {
    await expect(resolveNyuchiEntityId()).resolves.toBe(ENTITY_ID);
    expect(entityFindOne).toHaveBeenCalledWith(
      { slug: NYUCHI_ENTITY_SLUG, isActive: true },
      expect.anything(),
    );

    await expect(resolveNyuchiEntityId()).resolves.toBe(ENTITY_ID);
    expect(entityFindOne).toHaveBeenCalledTimes(1); // served from cache
  });

  it("returns null when the entity is missing — and does NOT cache it", async () => {
    entityFindOne.mockResolvedValue(null);
    await expect(resolveNyuchiEntityId()).resolves.toBeNull();

    entityFindOne.mockResolvedValue({ _id: ENTITY_ID });
    await expect(resolveNyuchiEntityId()).resolves.toBe(ENTITY_ID); // recovers
  });

  it("fails closed (null) on a lookup error without caching the failure", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    entityFindOne.mockRejectedValue(new Error("cluster wobbly"));
    await expect(resolveNyuchiEntityId()).resolves.toBeNull();

    entityFindOne.mockResolvedValue({ _id: ENTITY_ID });
    await expect(resolveNyuchiEntityId()).resolves.toBe(ENTITY_ID); // recovers
    consoleError.mockRestore();
  });
});

describe("hasActiveNyuchiMembership", () => {
  it("queries an ACTIVE staff-role membership for (personId, entityId)", async () => {
    await expect(
      hasActiveNyuchiMembership(PERSON_ID, ENTITY_ID),
    ).resolves.toBe(true);
    expect(membershipFindOne).toHaveBeenCalledWith(
      {
        personId: PERSON_ID,
        entityId: ENTITY_ID,
        isActive: true,
        membershipRole: { $in: ADMIN_MEMBERSHIP_ROLES },
      },
      expect.anything(),
    );
  });

  it("audience relations are excluded from the staff-role filter", () => {
    for (const audienceRole of ["follower", "contributor", "kin"]) {
      expect(ADMIN_MEMBERSHIP_ROLES).not.toContain(audienceRole);
    }
  });

  it("returns false when no row matches", async () => {
    membershipFindOne.mockResolvedValue(null);
    await expect(
      hasActiveNyuchiMembership(PERSON_ID, ENTITY_ID),
    ).resolves.toBe(false);
  });

  it("fails closed (false) on a lookup error", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    membershipFindOne.mockRejectedValue(new Error("cluster wobbly"));
    await expect(
      hasActiveNyuchiMembership(PERSON_ID, ENTITY_ID),
    ).resolves.toBe(false);
    consoleError.mockRestore();
  });
});

describe("decideMembershipGate (pure deny semantics)", () => {
  it("denies when the entity is unresolved, whatever the membership says", () => {
    expect(decideMembershipGate(null, true)).toBeNull();
    expect(decideMembershipGate(null, false)).toBeNull();
  });

  it("passes only an active member of a resolved entity", () => {
    expect(decideMembershipGate(ENTITY_ID, true)).toBe(ENTITY_ID);
    expect(decideMembershipGate(ENTITY_ID, false)).toBeNull();
  });
});

describe("requireNyuchiMembership", () => {
  it("returns the entity id for an active staff member", async () => {
    await expect(
      requireNyuchiMembership({ personId: PERSON_ID }),
    ).resolves.toBe(ENTITY_ID);
  });

  it("denies a non-member without ever passing them", async () => {
    membershipFindOne.mockResolvedValue(null);
    await expect(
      requireNyuchiMembership({ personId: PERSON_ID }),
    ).resolves.toBeNull();
  });

  it("denies when the entity can't be resolved — membership never checked", async () => {
    entityFindOne.mockResolvedValue(null);
    await expect(
      requireNyuchiMembership({ personId: PERSON_ID }),
    ).resolves.toBeNull();
    expect(membershipFindOne).not.toHaveBeenCalled();
  });
});
