import { describe, it, expect, vi, beforeEach } from "vitest";

// Guard imports (`server-only`) and the Mongo driver layer so the WorkOS
// org-membership mirror can be unit-tested with fake collections.
vi.mock("server-only", () => ({}));

const entities = {
  findOne: vi.fn(),
  findOneAndUpdate: vi.fn(),
  insertOne: vi.fn(),
  find: vi.fn(),
};
const memberships = { updateOne: vi.fn(), insertOne: vi.fn(), find: vi.fn() };
const persons = { findOne: vi.fn(), updateOne: vi.fn(), findOneAndUpdate: vi.fn() };

/** A minimal Mongo cursor stand-in returning `arr` from `.toArray()`. */
function cursor<T>(arr: T[]) {
  return { toArray: async () => arr };
}

vi.mock("@/lib/mongo/databases", () => ({
  entitiesCollection: vi.fn(async () => entities),
  entityMembershipsCollection: vi.fn(async () => memberships),
  personsCollection: vi.fn(async () => persons),
}));

import {
  buildWorkosMembershipWrite,
  canManageHostEntity,
  createCommunityEntityForPerson,
  endWorkosOrganizationMembership,
  ensureEntityForWorkosOrg,
  getPersonHostRoleForEntity,
  listHostEntitiesWithRoleForPerson,
  mirrorWorkosOrganizationMembership,
  renameHostEntityForPerson,
  setDefaultHostEntityForPerson,
  workosRoleToMembershipRole,
} from "./entities";

/** Required fields on the live `entity.memberships` validator. */
const MEMBERSHIP_REQUIRED_FIELDS = [
  "_id",
  "_schemaVersion",
  "personId",
  "entityId",
  "membershipRole",
  "isActive",
  "joinedAt",
  "createdAt",
  "updatedAt",
] as const;

/** Required fields on the live `entity.entities` validator. */
const ENTITY_REQUIRED_FIELDS = [
  "_id",
  "_schemaVersion",
  "entityType",
  "ecosystemRole",
  "schemaOrgType",
  "slug",
  "name",
  "isActive",
  "isPrivateByDefault",
  "createdAt",
  "updatedAt",
] as const;

const membershipInput = {
  workosOrganizationMembershipId: "om_123",
  workosOrganizationId: "org_456",
  organizationName: "Harare Makers Collective",
  workosUserId: "user_789",
  roleSlug: "admin",
  status: "active" as const,
};

beforeEach(() => {
  vi.clearAllMocks();
  entities.findOneAndUpdate.mockResolvedValue({ _id: "entity-1", name: "Harare Makers Collective" });
  memberships.updateOne.mockResolvedValue({ acknowledged: true });
  // ensurePersonForWorkosId goes through personsCollection().findOneAndUpdate.
  persons.findOneAndUpdate.mockResolvedValue({ _id: "person-1", workosUserId: "user_789" });
});

describe("workosRoleToMembershipRole", () => {
  it("passes through slugs already in the v3.1 enum", () => {
    expect(workosRoleToMembershipRole("admin")).toBe("admin");
    expect(workosRoleToMembershipRole("member")).toBe("member");
    expect(workosRoleToMembershipRole("Manager")).toBe("manager");
  });

  it("degrades unknown/missing slugs to plain member (never escalates)", () => {
    expect(workosRoleToMembershipRole("owner")).toBe("member");
    expect(workosRoleToMembershipRole("billing-admin")).toBe("member");
    expect(workosRoleToMembershipRole(null)).toBe("member");
    expect(workosRoleToMembershipRole(undefined)).toBe("member");
  });
});

describe("ensureEntityForWorkosOrg", () => {
  it("upserts keyed on the workosOrganizationId join key, $setOnInsert only", async () => {
    await ensureEntityForWorkosOrg({
      workosOrganizationId: "org_456",
      organizationName: "Harare Makers Collective",
    });

    const [filter, update, options] = entities.findOneAndUpdate.mock.calls[0];
    expect(filter).toEqual({ workosOrganizationId: "org_456" });
    expect(options).toMatchObject({ upsert: true });
    // No $set — an existing entity's name/slug are never overwritten.
    expect(update.$set).toBeUndefined();

    const doc = { ...filter, ...update.$setOnInsert };
    for (const field of ENTITY_REQUIRED_FIELDS) {
      expect(doc, `missing required field ${field}`).toHaveProperty(field);
      expect(doc[field], `required field ${field} must not be undefined/null`).not.toBeNull();
    }
    expect(update.$setOnInsert.entityType).toBe("organization");
    expect(update.$setOnInsert.ecosystemRole).toBe("external");
    expect(update.$setOnInsert.schemaOrgType).toBe("Organization");
    expect(update.$setOnInsert.name).toBe("Harare Makers Collective");
    expect(update.$setOnInsert.createdAt).toBeInstanceOf(Date);
  });

  it("falls back to a generic name when the org name is missing", async () => {
    await ensureEntityForWorkosOrg({ workosOrganizationId: "org_456" });
    const [, update] = entities.findOneAndUpdate.mock.calls[0];
    expect(update.$setOnInsert.name).toBe("Organisation");
    expect(update.$setOnInsert.slug).toBeTruthy();
  });
});

describe("buildWorkosMembershipWrite", () => {
  const params = {
    personId: "person-1",
    entityId: "entity-1",
    membershipRole: "admin" as const,
    isActive: true,
    workosOrganizationMembershipId: "om_123",
    workosOrganizationId: "org_456",
  };

  it("materializes every entity.memberships required field on insert", () => {
    const { filter, update } = buildWorkosMembershipWrite(params);
    const doc = {
      ...(filter as Record<string, unknown>),
      ...(update.$setOnInsert as Record<string, unknown>),
      ...(update.$set as Record<string, unknown>),
    };
    for (const field of MEMBERSHIP_REQUIRED_FIELDS) {
      expect(doc, `missing required field ${field}`).toHaveProperty(field);
      expect(doc[field], `required field ${field} must not be undefined/null`).not.toBeNull();
    }
    expect(doc._schemaVersion).toBe("v3.1");
    expect(doc.joinedAt).toBeInstanceOf(Date);
    expect(doc.updatedAt).toBeInstanceOf(Date);
  });

  it("keys on (personId, entityId) and carries the WorkOS join keys mutably", () => {
    const { filter, update } = buildWorkosMembershipWrite(params);
    expect(filter).toEqual({ personId: "person-1", entityId: "entity-1" });
    const set = update.$set as Record<string, unknown>;
    expect(set.workosOrganizationMembershipId).toBe("om_123");
    expect(set.workosOrganizationId).toBe("org_456");
    // Active membership clears any previous end.
    expect(set.isActive).toBe(true);
    expect(set.endedAt).toBeNull();
  });

  it("stamps endedAt when the membership is not active", () => {
    const { update } = buildWorkosMembershipWrite({ ...params, isActive: false });
    const set = update.$set as Record<string, unknown>;
    expect(set.isActive).toBe(false);
    expect(set.endedAt).toBeInstanceOf(Date);
  });
});

describe("mirrorWorkosOrganizationMembership", () => {
  it("ensures the person stub + org entity, then upserts the membership", async () => {
    await mirrorWorkosOrganizationMembership(membershipInput);

    // Person stub keyed on the WorkOS user id.
    expect(persons.findOneAndUpdate).toHaveBeenCalledWith(
      { workosUserId: "user_789" },
      expect.anything(),
      expect.objectContaining({ upsert: true }),
    );
    // Entity keyed on the WorkOS org id.
    expect(entities.findOneAndUpdate).toHaveBeenCalledWith(
      { workosOrganizationId: "org_456" },
      expect.anything(),
      expect.objectContaining({ upsert: true }),
    );

    const [filter, update, options] = memberships.updateOne.mock.calls[0];
    expect(filter).toEqual({ personId: "person-1", entityId: "entity-1" });
    expect(options).toMatchObject({ upsert: true });
    expect(update.$set.membershipRole).toBe("admin");
    expect(update.$set.isActive).toBe(true);
  });

  it("maps a pending membership to an inactive row", async () => {
    await mirrorWorkosOrganizationMembership({ ...membershipInput, status: "pending" });
    const [, update] = memberships.updateOne.mock.calls[0];
    expect(update.$set.isActive).toBe(false);
  });

  it("replays idempotently — same keyed filter on every delivery", async () => {
    await mirrorWorkosOrganizationMembership(membershipInput);
    await mirrorWorkosOrganizationMembership(membershipInput);
    expect(memberships.updateOne).toHaveBeenCalledTimes(2);
    const filters = memberships.updateOne.mock.calls.map(([f]) => f);
    expect(filters[0]).toEqual(filters[1]);
  });
});

describe("endWorkosOrganizationMembership", () => {
  it("ends the mirrored row keyed on the om_… join key, never upserting", async () => {
    await endWorkosOrganizationMembership({ workosOrganizationMembershipId: "om_123" });

    const [filter, update, options] = memberships.updateOne.mock.calls[0];
    expect(filter).toEqual({ workosOrganizationMembershipId: "om_123" });
    expect(update.$set.isActive).toBe(false);
    expect(update.$set.endedAt).toBeInstanceOf(Date);
    // Deleting a membership that was never mirrored must not create a row.
    expect(options?.upsert).toBeUndefined();
  });
});

// ── Entity management (account preferences) ────────────────────────────

describe("canManageHostEntity", () => {
  it("allows manage-level roles on a family entity", () => {
    expect(canManageHostEntity("founder", "family")).toBe(true);
    expect(canManageHostEntity("admin", "family")).toBe(true);
    expect(canManageHostEntity("manager", "family")).toBe(true);
  });

  it("denies non-manage roles even on a family entity", () => {
    expect(canManageHostEntity("representative", "family")).toBe(false);
    expect(canManageHostEntity("member", "family")).toBe(false);
  });

  it("denies every role on a non-family (WorkOS-owned) entity", () => {
    expect(canManageHostEntity("founder", "organization")).toBe(false);
    expect(canManageHostEntity("admin", "organization")).toBe(false);
  });
});

describe("listHostEntitiesWithRoleForPerson", () => {
  it("returns each hostable entity paired with the person's highest role", async () => {
    memberships.find.mockReturnValue(
      cursor([
        { entityId: "e1", membershipRole: "manager" },
        { entityId: "e1", membershipRole: "founder" },
        { entityId: "e2", membershipRole: "representative" },
      ]),
    );
    entities.find.mockReturnValue(
      cursor([
        { _id: "e1", name: "Family", entityType: "family" },
        { _id: "e2", name: "Org", entityType: "organization" },
      ]),
    );

    const rows = await listHostEntitiesWithRoleForPerson("person-1");
    const byId = Object.fromEntries(rows.map((r) => [r.entity._id, r.role]));
    // founder outranks manager on e1.
    expect(byId.e1).toBe("founder");
    expect(byId.e2).toBe("representative");

    const [filter] = memberships.find.mock.calls[0];
    expect(filter).toMatchObject({ personId: "person-1", isActive: true });
  });

  it("returns [] when the person hosts through nothing", async () => {
    memberships.find.mockReturnValue(cursor([]));
    const rows = await listHostEntitiesWithRoleForPerson("person-1");
    expect(rows).toEqual([]);
    expect(entities.find).not.toHaveBeenCalled();
  });
});

describe("getPersonHostRoleForEntity", () => {
  it("returns the highest active hostable role on the entity", async () => {
    memberships.find.mockReturnValue(
      cursor([
        { membershipRole: "manager" },
        { membershipRole: "admin" },
      ]),
    );
    expect(await getPersonHostRoleForEntity("p1", "e1")).toBe("admin");
  });

  it("returns null when the person holds no hostable membership", async () => {
    memberships.find.mockReturnValue(cursor([]));
    expect(await getPersonHostRoleForEntity("p1", "e1")).toBeNull();
  });
});

describe("renameHostEntityForPerson", () => {
  it("renames a family entity for a manage-level member, regenerating the slug", async () => {
    entities.findOne.mockResolvedValue({ _id: "e1", entityType: "family", name: "Old" });
    memberships.find.mockReturnValue(cursor([{ membershipRole: "founder" }]));
    entities.findOneAndUpdate.mockResolvedValue({ _id: "e1", name: "New name" });

    await renameHostEntityForPerson({ personId: "p1", entityId: "e1", name: "  New name  " });

    const [filter, update, options] = entities.findOneAndUpdate.mock.calls[0];
    expect(filter).toEqual({ _id: "e1" });
    expect(update.$set.name).toBe("New name");
    expect(update.$set.slug).toMatch(/^new-name-/);
    expect(update.$set.updatedAt).toBeInstanceOf(Date);
    expect(options).toMatchObject({ returnDocument: "after" });
  });

  it("rejects a rename on an organisation entity (read-only here)", async () => {
    entities.findOne.mockResolvedValue({ _id: "e2", entityType: "organization", name: "Org" });
    memberships.find.mockReturnValue(cursor([{ membershipRole: "admin" }]));

    await expect(
      renameHostEntityForPerson({ personId: "p1", entityId: "e2", name: "Hacked" }),
    ).rejects.toThrow(/permission/i);
    expect(entities.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it("rejects a rename from a non-manage member", async () => {
    entities.findOne.mockResolvedValue({ _id: "e1", entityType: "family", name: "Fam" });
    memberships.find.mockReturnValue(cursor([{ membershipRole: "representative" }]));

    await expect(
      renameHostEntityForPerson({ personId: "p1", entityId: "e1", name: "Nope" }),
    ).rejects.toThrow(/permission/i);
    expect(entities.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it("rejects an empty name", async () => {
    await expect(
      renameHostEntityForPerson({ personId: "p1", entityId: "e1", name: "   " }),
    ).rejects.toThrow(/name is required/i);
  });
});

describe("setDefaultHostEntityForPerson", () => {
  it("writes bundu.defaultFamilyEntityId when the person hosts through the entity", async () => {
    memberships.find.mockReturnValue(cursor([{ membershipRole: "founder" }]));
    persons.updateOne.mockResolvedValue({ acknowledged: true });

    await setDefaultHostEntityForPerson({ personId: "p1", entityId: "e1" });

    const [filter, update] = persons.updateOne.mock.calls[0];
    expect(filter).toEqual({ _id: "p1" });
    expect(update.$set["bundu.defaultFamilyEntityId"]).toBe("e1");
    expect(update.$set.updatedAt).toBeInstanceOf(Date);
  });

  it("refuses to default to an entity the person cannot host through", async () => {
    memberships.find.mockReturnValue(cursor([]));

    await expect(
      setDefaultHostEntityForPerson({ personId: "p1", entityId: "e1" }),
    ).rejects.toThrow(/host through/i);
    expect(persons.updateOne).not.toHaveBeenCalled();
  });
});

describe("createCommunityEntityForPerson", () => {
  it("writes a validator-complete community entity and a founder membership", async () => {
    entities.insertOne.mockResolvedValue({ acknowledged: true });
    memberships.insertOne.mockResolvedValue({ acknowledged: true });

    const doc = await createCommunityEntityForPerson({
      personId: "p1",
      name: "Harare Runners Club",
      description: "Weekend trail runs.",
    });

    for (const field of ENTITY_REQUIRED_FIELDS) {
      expect(doc).toHaveProperty(field);
    }
    expect(doc.entityType).toBe("community");
    expect(doc.schemaOrgType).toBe("Organization");
    expect(doc.isPrivateByDefault).toBe(false);
    expect(doc.founderPersonId).toBe("p1");
    expect(doc.name).toBe("Harare Runners Club");
    expect(doc.description).toBe("Weekend trail runs.");

    const [membershipDoc] = memberships.insertOne.mock.calls[0];
    for (const field of MEMBERSHIP_REQUIRED_FIELDS) {
      expect(membershipDoc).toHaveProperty(field);
    }
    expect(membershipDoc.personId).toBe("p1");
    expect(membershipDoc.entityId).toBe(doc._id);
    expect(membershipDoc.membershipRole).toBe("founder");
    expect(membershipDoc.isActive).toBe(true);
  });

  it("rejects a blank name without writing anything", async () => {
    await expect(
      createCommunityEntityForPerson({ personId: "p1", name: "   " }),
    ).rejects.toThrow(/name/i);
    expect(entities.insertOne).not.toHaveBeenCalled();
    expect(memberships.insertOne).not.toHaveBeenCalled();
  });

  it("rejects a name over the length limit", async () => {
    await expect(
      createCommunityEntityForPerson({ personId: "p1", name: "x".repeat(121) }),
    ).rejects.toThrow(/120/);
    expect(entities.insertOne).not.toHaveBeenCalled();
  });
});
