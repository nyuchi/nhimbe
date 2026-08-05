import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const usageCounters = { findOne: vi.fn(), findOneAndUpdate: vi.fn() };

vi.mock("@/lib/mongo/databases", () => ({
  DB: { system: "system" },
  getCollection: vi.fn(async () => usageCounters),
}));

import { consumeDailyUsage, UsageLimitExceededError } from "./usage-limits";

beforeEach(() => {
  vi.clearAllMocks();
  usageCounters.findOne.mockResolvedValue(null);
  usageCounters.findOneAndUpdate.mockResolvedValue({ count: 1 });
});

describe("consumeDailyUsage", () => {
  it("allows and increments the first use of the day", async () => {
    const count = await consumeDailyUsage({ subjectId: "person-1", counterType: "aiGeneration", limit: 5 });
    expect(count).toBe(1);
    expect(usageCounters.findOneAndUpdate).toHaveBeenCalledTimes(1);
    const [filter, update, opts] = usageCounters.findOneAndUpdate.mock.calls[0];
    expect(filter._id).toMatch(/^aiGeneration:person-1:\d{4}-\d{2}-\d{2}$/);
    expect(update.$inc).toEqual({ count: 1 });
    expect(opts).toEqual({ upsert: true, returnDocument: "after" });
  });

  it("throws UsageLimitExceededError once the daily limit is reached, without incrementing", async () => {
    usageCounters.findOne.mockResolvedValueOnce({ count: 5 });
    await expect(
      consumeDailyUsage({ subjectId: "event-1", counterType: "blast", limit: 5 }),
    ).rejects.toThrow(UsageLimitExceededError);
    expect(usageCounters.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it("allows one more use right up to the limit boundary", async () => {
    usageCounters.findOne.mockResolvedValueOnce({ count: 4 });
    await expect(
      consumeDailyUsage({ subjectId: "event-1", counterType: "blast", limit: 5 }),
    ).resolves.toBe(1);
  });

  it("treats a limit of 0 as unlimited and never touches the collection", async () => {
    const count = await consumeDailyUsage({ subjectId: "person-1", counterType: "aiGeneration", limit: 0 });
    expect(count).toBe(0);
    expect(usageCounters.findOne).not.toHaveBeenCalled();
    expect(usageCounters.findOneAndUpdate).not.toHaveBeenCalled();
  });
});
