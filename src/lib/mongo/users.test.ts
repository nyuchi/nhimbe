import { describe, it, expect, vi, beforeEach } from "vitest";

// Guard imports (`server-only`) and the Mongo driver layer so the person sync
// can be unit-tested with fake collections (no cluster here).
vi.mock("server-only", () => ({}));

const persons = { findOne: vi.fn(), findOneAndUpdate: vi.fn(), updateOne: vi.fn() };

vi.mock("@/lib/mongo/databases", () => ({
  personsCollection: vi.fn(async () => persons),
}));

import {
  deactivatePersonByWorkosId,
  ensurePersonForWorkosId,
  mapPersonToAppUser,
  syncInputFromWorkosUser,
  syncPersonFromWorkos,
} from "./users";
import type { PersonDoc } from "./types";

/** A minimal validator-complete person doc for mapper tests. */
function baseDoc(extra: Partial<PersonDoc> = {}): PersonDoc {
  return {
    _id: "person-1",
    _schemaVersion: "v3.1",
    workosUserId: "user_123",
    email: "amai@example.com",
    name: "Amai Mukoko",
    emailVerified: true,
    phoneNumberVerified: false,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...extra,
  } as PersonDoc;
}

describe("mapPersonToAppUser", () => {
  it("defaults locale to English and treats event updates as opt-out (ON)", () => {
    const user = mapPersonToAppUser(baseDoc());
    expect(user.locale).toBe("en");
    expect(user.subscribedToEventUpdates).toBe(true);
  });

  it("surfaces a known stored locale", () => {
    expect(mapPersonToAppUser(baseDoc({ locale: "sn" })).locale).toBe("sn");
  });

  it("falls back to English for an unknown locale value", () => {
    expect(mapPersonToAppUser(baseDoc({ locale: "fr" })).locale).toBe("en");
  });

  it("reads an explicit event-update opt-out", () => {
    const user = mapPersonToAppUser(baseDoc({ mukoko: { notifications: { eventUpdates: false } } }));
    expect(user.subscribedToEventUpdates).toBe(false);
  });
});

/** Required fields on the live `identity.persons` validator. */
const PERSON_REQUIRED_FIELDS = [
  "_id",
  "_schemaVersion",
  "isActive",
  "emailVerified",
  "phoneNumberVerified",
  "createdAt",
  "updatedAt",
] as const;

/** Union the keys a keyed upsert would materialize on insert. */
function insertedShape(
  filter: Record<string, unknown>,
  update: { $set?: Record<string, unknown>; $setOnInsert?: Record<string, unknown> },
): Record<string, unknown> {
  return { ...filter, ...(update.$setOnInsert ?? {}), ...(update.$set ?? {}) };
}

beforeEach(() => {
  vi.clearAllMocks();
  persons.findOneAndUpdate.mockResolvedValue({
    _id: "person-1",
    _schemaVersion: "v3.1",
    workosUserId: "user_123",
    emailVerified: true,
    phoneNumberVerified: false,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  persons.updateOne.mockResolvedValue({ matchedCount: 1, modifiedCount: 1 });
});

describe("syncInputFromWorkosUser", () => {
  it("maps a webhook-shaped user (full name present)", () => {
    expect(
      syncInputFromWorkosUser({
        id: "user_123",
        email: "amai@example.com",
        name: "Amai Mukoko",
        firstName: "Amai",
        lastName: "Mukoko",
        profilePictureUrl: "https://img.example/a.png",
        emailVerified: true,
      }),
    ).toEqual({
      workosUserId: "user_123",
      email: "amai@example.com",
      name: "Amai Mukoko",
      givenName: "Amai",
      familyName: "Mukoko",
      picture: "https://img.example/a.png",
      emailVerified: true,
    });
  });

  it("maps a session-shaped user (no `name`) by joining first/last", () => {
    const input = syncInputFromWorkosUser({
      id: "user_456",
      email: "baba@example.com",
      firstName: "Baba",
      lastName: null,
      emailVerified: false,
    });
    expect(input.name).toBe("Baba");
    expect(input.familyName).toBeNull();
    expect(input.emailVerified).toBe(false);
  });

  it("leaves emailVerified undefined when the claim is absent", () => {
    const input = syncInputFromWorkosUser({ id: "user_789" });
    expect(input.emailVerified).toBeUndefined();
    expect(input.email).toBeNull();
    expect(input.name).toBeNull();
  });
});

describe("syncPersonFromWorkos", () => {
  const input = {
    workosUserId: "user_123",
    email: "amai@example.com",
    name: "Amai Mukoko",
    emailVerified: true,
  };

  it("upserts keyed on workosUserId and materializes every validator-required field", async () => {
    await syncPersonFromWorkos(input);

    expect(persons.findOneAndUpdate).toHaveBeenCalledTimes(1);
    const [filter, update, options] = persons.findOneAndUpdate.mock.calls[0];
    expect(filter).toEqual({ workosUserId: "user_123" });
    expect(options).toMatchObject({ upsert: true });

    const doc = insertedShape(filter, update);
    for (const field of PERSON_REQUIRED_FIELDS) {
      expect(doc, `missing required field ${field}`).toHaveProperty(field);
      expect(doc[field], `required field ${field} must not be undefined/null`).not.toBeNull();
    }
    expect(update.$setOnInsert._schemaVersion).toBe("v3.1");
    expect(update.$setOnInsert.createdAt).toBeInstanceOf(Date);
    expect(update.$set.updatedAt).toBeInstanceOf(Date);
    expect(update.$set.lastSeenAt).toBeInstanceOf(Date);
  });

  it("defaults emailVerified only on insert when the claim is absent", async () => {
    await syncPersonFromWorkos({ workosUserId: "user_123", email: null, name: null });
    const [, update] = persons.findOneAndUpdate.mock.calls[0];
    // A momentarily-missing claim must not regress a verified user.
    expect(update.$set).not.toHaveProperty("emailVerified");
    expect(update.$setOnInsert.emailVerified).toBe(false);
  });

  it("is a replay-safe keyed upsert (same filter on every call)", async () => {
    await syncPersonFromWorkos(input);
    await syncPersonFromWorkos(input);
    const filters = persons.findOneAndUpdate.mock.calls.map(([f]) => f);
    expect(filters[0]).toEqual(filters[1]);
  });
});

describe("ensurePersonForWorkosId", () => {
  it("creates a validator-complete stub via $setOnInsert only", async () => {
    await ensurePersonForWorkosId("user_123");

    const [filter, update, options] = persons.findOneAndUpdate.mock.calls[0];
    expect(filter).toEqual({ workosUserId: "user_123" });
    expect(options).toMatchObject({ upsert: true });

    // No $set — an existing person's profile is never clobbered.
    expect(update.$set).toBeUndefined();
    const doc = insertedShape(filter, update);
    for (const field of PERSON_REQUIRED_FIELDS) {
      expect(doc, `missing required field ${field}`).toHaveProperty(field);
      expect(doc[field], `required field ${field} must not be undefined/null`).not.toBeNull();
    }
    expect(update.$setOnInsert.isActive).toBe(true);
    expect(update.$setOnInsert.emailVerified).toBe(false);
  });

  it("returns the (existing or inserted) person doc", async () => {
    const person = await ensurePersonForWorkosId("user_123");
    expect(person._id).toBe("person-1");
  });
});

describe("deactivatePersonByWorkosId", () => {
  it("soft-deactivates without upserting or hard-deleting", async () => {
    const matched = await deactivatePersonByWorkosId("user_123");

    expect(matched).toBe(true);
    expect(persons.updateOne).toHaveBeenCalledTimes(1);
    const [filter, update, options] = persons.updateOne.mock.calls[0];
    expect(filter).toEqual({ workosUserId: "user_123" });
    expect(update.$set.isActive).toBe(false);
    expect(update.$set.updatedAt).toBeInstanceOf(Date);
    // Never an upsert: deleting an unknown user must not create a doc.
    expect(options?.upsert).toBeUndefined();
  });

  it("reports false when no person matched", async () => {
    persons.updateOne.mockResolvedValueOnce({ matchedCount: 0, modifiedCount: 0 });
    await expect(deactivatePersonByWorkosId("user_unknown")).resolves.toBe(false);
  });
});
