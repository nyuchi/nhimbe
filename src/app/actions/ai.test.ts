import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const requireActingPerson = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth/current-person", () => ({ requireActingPerson }));

const consumeDailyUsage = vi.hoisted(() => vi.fn());
const FakeUsageLimitExceededError = vi.hoisted(() => class extends Error {});
vi.mock("@/lib/mongo/usage-limits", () => ({
  consumeDailyUsage,
  UsageLimitExceededError: FakeUsageLimitExceededError,
}));

const getPlatformSettings = vi.hoisted(() => vi.fn());
vi.mock("@/lib/mongo/settings", () => ({ getPlatformSettings }));

const isGatewayConfigured = vi.hoisted(() => vi.fn());
const chat = vi.hoisted(() => vi.fn());
vi.mock("@/lib/ai/gateway", () => ({ isGatewayConfigured, chat }));

import { generateEventDescription, regenerateEventDescription } from "./ai";

const context = {
  eventName: "Harare Farmers Market",
  category: "Community",
  isOnline: false,
  eventType: "Market",
  targetAudience: "Families",
  keyTakeaways: "Fresh produce",
  highlights: "Live music",
};

beforeEach(() => {
  vi.clearAllMocks();
  requireActingPerson.mockResolvedValue({ _id: "person-1" });
  getPlatformSettings.mockResolvedValue({ freeAiGenerationsPerDayPerPerson: 5 });
  consumeDailyUsage.mockResolvedValue(1);
  isGatewayConfigured.mockReturnValue(false); // exercise the fallback path by default
});

describe("generateEventDescription (free-plan quota)", () => {
  it("checks the daily quota, keyed by the signed-in person, before generating", async () => {
    await generateEventDescription(context);

    expect(requireActingPerson).toHaveBeenCalledTimes(1);
    expect(consumeDailyUsage).toHaveBeenCalledWith({
      subjectId: "person-1",
      counterType: "aiGeneration",
      limit: 5,
    });
  });

  it("requires sign-in — never generates for an anonymous visitor", async () => {
    requireActingPerson.mockRejectedValueOnce(new Error("You must be signed in to use Shamwari."));
    await expect(generateEventDescription(context)).rejects.toThrow(/signed in/);
    expect(consumeDailyUsage).not.toHaveBeenCalled();
  });

  it("propagates the free-plan limit error instead of degrading to a fallback", async () => {
    consumeDailyUsage.mockRejectedValueOnce(new FakeUsageLimitExceededError("limit reached"));
    await expect(generateEventDescription(context)).rejects.toThrow("limit reached");
  });

  it("still degrades to a deterministic fallback when the gateway is unconfigured (quota allowed)", async () => {
    const result = await generateEventDescription(context);
    expect(result.description).toContain("market");
    expect(chat).not.toHaveBeenCalled();
  });
});

describe("regenerateEventDescription (free-plan quota)", () => {
  it("also checks the daily quota before rewriting", async () => {
    await regenerateEventDescription(context, "make it shorter");
    expect(consumeDailyUsage).toHaveBeenCalledWith({
      subjectId: "person-1",
      counterType: "aiGeneration",
      limit: 5,
    });
  });

  it("propagates the free-plan limit error", async () => {
    consumeDailyUsage.mockRejectedValueOnce(new FakeUsageLimitExceededError("limit reached"));
    await expect(regenerateEventDescription(context, "shorter")).rejects.toThrow("limit reached");
  });
});
