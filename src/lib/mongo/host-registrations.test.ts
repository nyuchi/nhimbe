import { describe, it, expect, vi, beforeEach } from "vitest";

// Guard imports (`server-only`) and the Mongo driver layer so the cancel
// transition (and its Planner write-through hook) can be unit-tested.
vi.mock("server-only", () => ({}));

const rsvps = { findOneAndUpdate: vi.fn() };

vi.mock("@/lib/mongo/databases", () => ({
  rsvpsCollection: vi.fn(async () => rsvps),
  checkInsCollection: vi.fn(async () => ({})),
  personsCollection: vi.fn(async () => ({})),
}));

const writeThroughReservationCancellation = vi.hoisted(() => vi.fn());
vi.mock("@/lib/mongo/planner", () => ({ writeThroughReservationCancellation }));

import { cancelRegistration } from "./host-registrations";

beforeEach(() => {
  vi.clearAllMocks();
  writeThroughReservationCancellation.mockResolvedValue(undefined);
});

describe("cancelRegistration", () => {
  it("flips the rsvp to No, then writes the transition through to the Planner", async () => {
    rsvps.findOneAndUpdate.mockResolvedValueOnce({
      _id: "rsvp-1",
      eventId: "event-1",
      attendeePersonId: "person-1",
      rsvpResponse: "RsvpResponseNo",
    });

    await cancelRegistration("rsvp-1");

    const [filter, update, options] = rsvps.findOneAndUpdate.mock.calls[0];
    expect(filter).toEqual({ _id: "rsvp-1" });
    expect(update.$set.rsvpResponse).toBe("RsvpResponseNo");
    expect(update.$set.updatedAt).toBeInstanceOf(Date);
    expect(options).toEqual({ returnDocument: "after" });

    expect(writeThroughReservationCancellation).toHaveBeenCalledTimes(1);
    expect(writeThroughReservationCancellation).toHaveBeenCalledWith({
      reservedPersonId: "person-1",
      eventId: "event-1",
    });
    // The primary write always precedes the write-through.
    expect(rsvps.findOneAndUpdate.mock.invocationCallOrder[0]).toBeLessThan(
      writeThroughReservationCancellation.mock.invocationCallOrder[0],
    );
  });

  it("skips the Planner write-through when the rsvp does not exist", async () => {
    rsvps.findOneAndUpdate.mockResolvedValueOnce(null);
    await cancelRegistration("rsvp-gone");
    expect(writeThroughReservationCancellation).not.toHaveBeenCalled();
  });
});
