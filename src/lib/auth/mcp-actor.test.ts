import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const persons = { findOne: vi.fn() };
vi.mock("@/lib/mongo/databases", () => ({
  personsCollection: vi.fn(async () => persons),
}));

const verifyBearer = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth/workos-token", () => ({ verifyBearer }));

const consumeDailyUsage = vi.hoisted(() => vi.fn());
const FakeUsageLimitExceededError = vi.hoisted(() => class extends Error {});
vi.mock("@/lib/mongo/usage-limits", () => ({
  consumeDailyUsage,
  UsageLimitExceededError: FakeUsageLimitExceededError,
}));

const getPlatformSettings = vi.hoisted(() => vi.fn());
vi.mock("@/lib/mongo/settings", () => ({ getPlatformSettings }));

const isMukokoPro = vi.hoisted(() => vi.fn());
vi.mock("@/lib/mongo/entitlements", () => ({ isMukokoPro }));

import { resolveActorFromBearer, ActorError } from "./mcp-actor";

const person = { _id: "person-1", workosUserId: "workos-1" };

beforeEach(() => {
  vi.clearAllMocks();
  verifyBearer.mockResolvedValue({ workosUserId: "workos-1" });
  persons.findOne.mockResolvedValue(person);
  getPlatformSettings.mockResolvedValue({ freeApiWritesPerDayPerCaller: 500 });
  consumeDailyUsage.mockResolvedValue(1);
  isMukokoPro.mockReturnValue(false);
});

describe("resolveActorFromBearer", () => {
  it("resolves the person and checks the free-plan API write quota, keyed by person", async () => {
    const resolved = await resolveActorFromBearer("Bearer token");
    expect(resolved).toBe(person);
    expect(consumeDailyUsage).toHaveBeenCalledWith({
      subjectId: "person-1",
      counterType: "apiWrite",
      limit: 500,
    });
  });

  it("skips the quota check entirely for a Mukoko Pro caller", async () => {
    isMukokoPro.mockReturnValueOnce(true);
    await resolveActorFromBearer("Bearer token");
    expect(consumeDailyUsage).not.toHaveBeenCalled();
  });

  it("maps a reached quota to a 429 ActorError", async () => {
    consumeDailyUsage.mockRejectedValue(new FakeUsageLimitExceededError("limit reached"));
    await expect(resolveActorFromBearer("Bearer token")).rejects.toMatchObject({
      status: 429,
      message: "limit reached",
    });
    await expect(resolveActorFromBearer("Bearer token")).rejects.toBeInstanceOf(ActorError);
  });

  it("still 401s an invalid token before ever checking the quota", async () => {
    verifyBearer.mockResolvedValueOnce(null);
    await expect(resolveActorFromBearer("Bearer bad")).rejects.toMatchObject({ status: 401 });
    expect(consumeDailyUsage).not.toHaveBeenCalled();
  });

  it("still 403s an unregistered person before ever checking the quota", async () => {
    persons.findOne.mockResolvedValueOnce(null);
    await expect(resolveActorFromBearer("Bearer token")).rejects.toMatchObject({ status: 403 });
    expect(consumeDailyUsage).not.toHaveBeenCalled();
  });
});
