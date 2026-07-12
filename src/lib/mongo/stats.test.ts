import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const events = { findOne: vi.fn(), updateOne: vi.fn() };
const rsvps = { countDocuments: vi.fn() };
const checkIns = { countDocuments: vi.fn() };

vi.mock("@/lib/mongo/databases", () => ({
  eventsCollection: vi.fn(async () => events),
  rsvpsCollection: vi.fn(async () => rsvps),
  checkInsCollection: vi.fn(async () => checkIns),
}));

import { getEventStats, recordEventView } from "./stats";

beforeEach(() => {
  vi.clearAllMocks();
  events.findOne.mockResolvedValue(null);
  events.updateOne.mockResolvedValue({ matchedCount: 1 });
  rsvps.countDocuments.mockResolvedValue(0);
  checkIns.countDocuments.mockResolvedValue(0);
});

describe("getEventStats", () => {
  it("counts affirmative RSVPs and check-ins and reads mukoko.viewCount", async () => {
    rsvps.countDocuments.mockResolvedValueOnce(7);
    checkIns.countDocuments.mockResolvedValueOnce(3);
    events.findOne.mockResolvedValueOnce({ mukoko: { viewCount: 42 } });

    const stats = await getEventStats("event-1");

    expect(rsvps.countDocuments).toHaveBeenCalledWith({
      eventId: "event-1",
      rsvpResponse: "RsvpResponseYes",
    });
    expect(stats).toMatchObject({ eventId: "event-1", rsvps: 7, checkins: 3, views: 42 });
  });

  it("defaults views to 0 when the counter is absent", async () => {
    const stats = await getEventStats("event-2");
    expect(stats.views).toBe(0);
  });
});

describe("recordEventView", () => {
  it("increments mukoko.viewCount and stamps updatedAt", async () => {
    const ok = await recordEventView("event-1");

    expect(events.updateOne).toHaveBeenCalledTimes(1);
    const [filter, update] = events.updateOne.mock.calls[0];
    expect(filter).toEqual({ _id: "event-1" });
    expect(update.$inc).toEqual({ "mukoko.viewCount": 1 });
    expect(update.$set.updatedAt).toBeInstanceOf(Date);
    expect(ok).toBe(true);
  });

  it("returns false when the event does not exist", async () => {
    events.updateOne.mockResolvedValueOnce({ matchedCount: 0 });
    expect(await recordEventView("missing")).toBe(false);
  });

  it("swallows write errors and returns false (best-effort)", async () => {
    events.updateOne.mockRejectedValueOnce(new Error("write failed"));
    expect(await recordEventView("event-1")).toBe(false);
  });
});
