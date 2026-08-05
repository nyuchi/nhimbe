import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const requireActingPerson = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth/current-person", () => ({ requireActingPerson }));

const isMukokoPro = vi.hoisted(() => vi.fn());
vi.mock("@/lib/mongo/entitlements", () => ({ isMukokoPro }));

const isGatewayConfigured = vi.hoisted(() => vi.fn());
const chat = vi.hoisted(() => vi.fn());
vi.mock("@/lib/ai/gateway", () => ({ isGatewayConfigured, chat }));

import { generateEventDescription, regenerateEventDescription } from "./ai";
import { ShamwariProRequiredError } from "@/lib/ai/shamwari-errors";

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
  requireActingPerson.mockResolvedValue({ _id: "person-1", mukoko: { proPlan: true } });
  isMukokoPro.mockReturnValue(true);
  isGatewayConfigured.mockReturnValue(false); // exercise the fallback path by default
});

describe("generateEventDescription (Mukoko Pro gate)", () => {
  it("checks the signed-in person's entitlement before generating", async () => {
    await generateEventDescription(context);
    expect(requireActingPerson).toHaveBeenCalledTimes(1);
    expect(isMukokoPro).toHaveBeenCalledWith({ _id: "person-1", mukoko: { proPlan: true } });
  });

  it("requires sign-in — never generates for an anonymous visitor", async () => {
    requireActingPerson.mockRejectedValueOnce(new Error("You must be signed in to use Shamwari."));
    await expect(generateEventDescription(context)).rejects.toThrow(/signed in/);
  });

  it("refuses a free-plan person outright, with no free allowance", async () => {
    isMukokoPro.mockReturnValue(false);
    await expect(generateEventDescription(context)).rejects.toThrow(ShamwariProRequiredError);
    await expect(generateEventDescription(context)).rejects.toThrow(/Mukoko Pro/);
  });

  it("still degrades to a deterministic fallback for a Pro person when the gateway is unconfigured", async () => {
    const result = await generateEventDescription(context);
    expect(result.description).toContain("market");
    expect(chat).not.toHaveBeenCalled();
  });
});

describe("regenerateEventDescription (Mukoko Pro gate)", () => {
  it("also checks the entitlement before rewriting", async () => {
    await regenerateEventDescription(context, "make it shorter");
    expect(isMukokoPro).toHaveBeenCalledTimes(1);
  });

  it("refuses a free-plan person outright", async () => {
    isMukokoPro.mockReturnValueOnce(false);
    await expect(regenerateEventDescription(context, "shorter")).rejects.toThrow(
      ShamwariProRequiredError,
    );
  });
});
