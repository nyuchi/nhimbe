import { describe, it, expect, vi, beforeEach } from "vitest";

// Guard imports (`server-only`) and the Mongo driver layer so the planner
// write-through can be unit-tested with fake collections (no cluster here).
vi.mock("server-only", () => ({}));

const reservations = { updateOne: vi.fn(), insertOne: vi.fn(), findOne: vi.fn() };
const events = { findOne: vi.fn() };

vi.mock("@/lib/mongo/databases", () => ({
  plannerReservationsCollection: vi.fn(async () => reservations),
  eventsCollection: vi.fn(async () => events),
}));

// Observability binds console methods at module load, so spy at the logger
// level to assert the [mukoko] logging of swallowed failures. Hoisted because
// planner.ts calls createLogger() at import time.
const plannerLogger = vi.hoisted(() => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));
vi.mock("@/lib/observability", () => ({
  createLogger: vi.fn(() => plannerLogger),
}));

import {
  rsvpResponseToReservationStatus,
  buildReservationFor,
  buildReservationWrite,
  upsertEventReservation,
  cancelEventReservation,
  writeThroughReservation,
  writeThroughReservationCancellation,
  type UpsertReservationInput,
} from "./planner";

/**
 * Required fields on the live `planner.reservations` validator (moderate /
 * error — a missing one throws). The upsert must emit every one of these
 * across filter ∪ $set ∪ $setOnInsert.
 */
const RESERVATION_REQUIRED_FIELDS = [
  "_id",
  "_schemaVersion",
  "iCalUid",
  "schemaOrgType",
  "reservationStatus",
  "reservedPersonId",
  "reservedEntityId",
  "originatingApp",
  "bookingTime",
  "createdAt",
  "updatedAt",
] as const;

const event = {
  _id: "event-1",
  iCalUid: "ical-abc@nhimbe.com",
  name: "Harare Farmers Market",
  startDate: new Date("2026-08-01T09:00:00Z"),
  endDate: new Date("2026-08-01T13:00:00Z"),
  location: { "@type": "Place", name: "Harare Gardens" },
  url: "https://nhimbe.com/events/event-1",
};

const person = { _id: "person-1", name: "Rudo M" };

const baseInput: UpsertReservationInput = {
  event,
  person,
  reservedEntityId: "entity-1",
  reservationStatus: "ReservationConfirmed",
  partySize: 3,
};

beforeEach(() => {
  vi.clearAllMocks();
  reservations.updateOne.mockResolvedValue({ acknowledged: true, matchedCount: 0, upsertedCount: 1 });
  events.findOne.mockResolvedValue({ _id: "event-1", iCalUid: event.iCalUid });
});

describe("rsvpResponseToReservationStatus", () => {
  it("maps yes → ReservationConfirmed", () => {
    expect(rsvpResponseToReservationStatus("RsvpResponseYes")).toBe("ReservationConfirmed");
  });

  it("maps maybe → ReservationHold", () => {
    expect(rsvpResponseToReservationStatus("RsvpResponseMaybe")).toBe("ReservationHold");
  });

  it("maps no → ReservationCancelled", () => {
    expect(rsvpResponseToReservationStatus("RsvpResponseNo")).toBe("ReservationCancelled");
  });
});

describe("buildReservationWrite", () => {
  it("emits every validator-required field across filter/$set/$setOnInsert", () => {
    const { filter, update } = buildReservationWrite(baseInput);
    const emitted = new Set([
      ...Object.keys(filter),
      ...Object.keys(update.$set as Record<string, unknown>),
      ...Object.keys(update.$setOnInsert as Record<string, unknown>),
    ]);
    for (const field of RESERVATION_REQUIRED_FIELDS) {
      expect(emitted, `missing required field ${field}`).toContain(field);
    }
  });

  it("is keyed by (reservedPersonId, iCalUid) — the idempotency identity", () => {
    const { filter } = buildReservationWrite(baseInput);
    expect(filter).toEqual({ reservedPersonId: "person-1", iCalUid: "ical-abc@nhimbe.com" });
  });

  it("sets the v3.1 conventions: string UUID _id, _schemaVersion, BSON dates", () => {
    const { update } = buildReservationWrite(baseInput);
    const onInsert = update.$setOnInsert as Record<string, unknown>;
    const set = update.$set as Record<string, unknown>;
    expect(onInsert._id).toMatch(/^[0-9a-f-]{36}$/);
    expect(onInsert._schemaVersion).toBe("v3.1");
    expect(onInsert.bookingTime).toBeInstanceOf(Date);
    expect(onInsert.createdAt).toBeInstanceOf(Date);
    expect(set.updatedAt).toBeInstanceOf(Date);
  });

  it("carries the schema.org reservation shape and optional extras", () => {
    const { update } = buildReservationWrite(baseInput);
    const onInsert = update.$setOnInsert as Record<string, unknown>;
    const set = update.$set as Record<string, unknown>;
    expect(onInsert.schemaOrgType).toBe("EventReservation");
    expect(onInsert.originatingApp).toBe("events");
    expect(onInsert.reservedEntityId).toBe("entity-1");
    expect(set.reservationStatus).toBe("ReservationConfirmed");
    expect(set.partySize).toBe(3);
    expect(set.underName).toEqual({ "@type": "Person", name: "Rudo M" });
    expect(set.reservationFor).toMatchObject({
      "@type": "Event",
      name: "Harare Farmers Market",
      startDate: event.startDate,
      location: event.location,
    });
  });

  it("defaults partySize to 1 and underName to null when unavailable", () => {
    const { update } = buildReservationWrite({
      ...baseInput,
      person: { _id: "person-1", name: null },
      partySize: undefined,
    });
    const set = update.$set as Record<string, unknown>;
    expect(set.partySize).toBe(1);
    expect(set.underName).toBeNull();
  });
});

describe("buildReservationFor", () => {
  it("omits absent optional event fields", () => {
    const snapshot = buildReservationFor({
      _id: "e2",
      iCalUid: "ical-2",
      name: "Online meetup",
      startDate: new Date("2026-09-01T18:00:00Z"),
      endDate: new Date("2026-09-01T19:00:00Z"),
      location: null,
      url: null,
    });
    expect(snapshot).not.toHaveProperty("location");
    expect(snapshot).not.toHaveProperty("url");
    expect(snapshot["@type"]).toBe("Event");
  });
});

describe("upsertEventReservation", () => {
  it("creates the reservation with a single idempotent upsert on RSVP yes", async () => {
    await upsertEventReservation(baseInput);

    expect(reservations.updateOne).toHaveBeenCalledTimes(1);
    const [filter, , options] = reservations.updateOne.mock.calls[0];
    expect(filter).toEqual({ reservedPersonId: "person-1", iCalUid: "ical-abc@nhimbe.com" });
    expect(options).toEqual({ upsert: true });
    // Never a bare insert — duplication is impossible by construction.
    expect(reservations.insertOne).not.toHaveBeenCalled();
  });

  it("re-RSVP is idempotent: the same identity is targeted, updating in place", async () => {
    await upsertEventReservation(baseInput);
    reservations.updateOne.mockResolvedValueOnce({
      acknowledged: true,
      matchedCount: 1,
      upsertedCount: 0,
    });
    await upsertEventReservation({ ...baseInput, reservationStatus: "ReservationHold" });

    expect(reservations.updateOne).toHaveBeenCalledTimes(2);
    const [firstFilter] = reservations.updateOne.mock.calls[0];
    const [secondFilter, secondUpdate] = reservations.updateOne.mock.calls[1];
    expect(secondFilter).toEqual(firstFilter);
    expect((secondUpdate.$set as Record<string, unknown>).reservationStatus).toBe(
      "ReservationHold",
    );
    expect(reservations.insertOne).not.toHaveBeenCalled();
  });

  it("skips (without writing) when the event has no iCalUid to correlate on", async () => {
    await upsertEventReservation({ ...baseInput, event: { ...event, iCalUid: "" } });
    expect(reservations.updateOne).not.toHaveBeenCalled();
  });
});

describe("cancelEventReservation", () => {
  it("flips the status without upserting a row that never existed", async () => {
    await cancelEventReservation({ reservedPersonId: "person-1", iCalUid: "ical-abc@nhimbe.com" });

    expect(reservations.updateOne).toHaveBeenCalledTimes(1);
    const [filter, update, options] = reservations.updateOne.mock.calls[0];
    expect(filter).toEqual({ reservedPersonId: "person-1", iCalUid: "ical-abc@nhimbe.com" });
    expect(update.$set.reservationStatus).toBe("ReservationCancelled");
    expect(update.$set.updatedAt).toBeInstanceOf(Date);
    expect(options).toBeUndefined();
  });
});

describe("writeThroughReservation (never-throw contract)", () => {
  it("swallows and logs a Planner failure instead of failing the RSVP", async () => {
    reservations.updateOne.mockRejectedValueOnce(new Error("planner down"));

    await expect(writeThroughReservation(baseInput)).resolves.toBeUndefined();
    expect(plannerLogger.error).toHaveBeenCalledWith(
      "Planner reservation write-through failed",
      expect.objectContaining({ error: expect.any(Error) }),
    );
  });

  it("writes through when the Planner is healthy", async () => {
    await writeThroughReservation(baseInput);
    expect(reservations.updateOne).toHaveBeenCalledTimes(1);
  });
});

describe("writeThroughReservationCancellation (never-throw contract)", () => {
  it("resolves the event iCalUid then cancels the reservation", async () => {
    await writeThroughReservationCancellation({
      reservedPersonId: "person-1",
      eventId: "event-1",
    });

    expect(events.findOne).toHaveBeenCalledWith(
      { _id: "event-1" },
      { projection: { iCalUid: 1 } },
    );
    const [filter, update] = reservations.updateOne.mock.calls[0];
    expect(filter).toEqual({ reservedPersonId: "person-1", iCalUid: "ical-abc@nhimbe.com" });
    expect(update.$set.reservationStatus).toBe("ReservationCancelled");
  });

  it("does nothing when the event (or its iCalUid) cannot be resolved", async () => {
    events.findOne.mockResolvedValueOnce(null);
    await writeThroughReservationCancellation({
      reservedPersonId: "person-1",
      eventId: "gone",
    });
    expect(reservations.updateOne).not.toHaveBeenCalled();
    expect(plannerLogger.warn).toHaveBeenCalled();
  });

  it("swallows and logs a failure instead of failing the cancellation", async () => {
    events.findOne.mockRejectedValueOnce(new Error("cluster unreachable"));

    await expect(
      writeThroughReservationCancellation({ reservedPersonId: "person-1", eventId: "event-1" }),
    ).resolves.toBeUndefined();
    expect(plannerLogger.error).toHaveBeenCalledWith(
      "Planner reservation cancellation write-through failed",
      expect.objectContaining({ error: expect.any(Error) }),
    );
  });
});
