import { describe, it, expect, vi, beforeEach } from "vitest";

// Guard `server-only` and stub the Mongo + observability layers so the profile
// update action can be unit-tested without a cluster or a WorkOS session.
vi.mock("server-only", () => ({}));

const persons = { findOneAndUpdate: vi.fn() };

vi.mock("@/lib/mongo/databases", () => ({
  personsCollection: vi.fn(async () => persons),
}));

// Act through the local dev bypass so no WorkOS session machinery is needed.
vi.mock("@/lib/auth/dev", () => ({
  isDevBypass: () => true,
  DEV_WORKOS_ID: "workos-dev",
}));

vi.mock("@workos-inc/authkit-nextjs", () => ({
  withAuth: vi.fn(async () => ({ user: null })),
}));

const log = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
}));
vi.mock("@/lib/observability", () => ({ log }));

import { updateMyProfile } from "./profile";

/** A minimal validator-complete person doc the update returns. */
function personDoc(extra: Record<string, unknown> = {}) {
  return {
    _id: "person-1",
    _schemaVersion: "v3.1",
    workosUserId: "workos-dev",
    email: "dev@example.com",
    name: "Dev Person",
    emailVerified: true,
    phoneNumberVerified: false,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...extra,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  persons.findOneAndUpdate.mockResolvedValue(personDoc());
});

describe("updateMyProfile", () => {
  it("keys the write on the acting workosUserId and trims text fields", async () => {
    await updateMyProfile({ name: "  Amai  ", addressLocality: " Harare ", addressCountry: " ZW " });

    expect(persons.findOneAndUpdate).toHaveBeenCalledTimes(1);
    const [filter, update, options] = persons.findOneAndUpdate.mock.calls[0];
    expect(filter).toEqual({ workosUserId: "workos-dev" });
    expect(options).toMatchObject({ returnDocument: "after" });
    expect(update.$set.name).toBe("Amai");
    expect(update.$set.addressLocality).toBe("Harare");
    expect(update.$set.addressCountry).toBe("ZW");
    expect(update.$set.updatedAt).toBeInstanceOf(Date);
  });

  it("maps the event-update opt-out to the nested notifications path", async () => {
    await updateMyProfile({ subscribeToEventUpdates: false });
    const [, update] = persons.findOneAndUpdate.mock.calls[0];
    expect(update.$set["mukoko.notifications.eventUpdates"]).toBe(false);
  });

  it("persists a known locale to the OIDC `locale` field", async () => {
    await updateMyProfile({ locale: "sn" });
    const [, update] = persons.findOneAndUpdate.mock.calls[0];
    expect(update.$set.locale).toBe("sn");
  });

  it("ignores an unknown locale rather than writing an arbitrary value", async () => {
    // @ts-expect-error — exercising the runtime guard with an invalid value.
    await updateMyProfile({ locale: "fr" });
    const [, update] = persons.findOneAndUpdate.mock.calls[0];
    expect(update.$set).not.toHaveProperty("locale");
  });

  it("returns the updated user in the app shape and logs the changed fields", async () => {
    persons.findOneAndUpdate.mockResolvedValueOnce(personDoc({ locale: "sn", name: "Amai" }));
    const user = await updateMyProfile({ name: "Amai", locale: "sn" });

    expect(user?.name).toBe("Amai");
    expect(user?.locale).toBe("sn");
    expect(log.info).toHaveBeenCalledTimes(1);
    const [, ctx] = log.info.mock.calls[0];
    expect(ctx.data.fields).toEqual(expect.arrayContaining(["name", "locale"]));
    expect(ctx.data.fields).not.toContain("updatedAt");
  });

  it("throws when the account can't be resolved", async () => {
    persons.findOneAndUpdate.mockResolvedValueOnce(null);
    await expect(updateMyProfile({ name: "Nobody" })).rejects.toThrow(/resolve your account/i);
  });
});
