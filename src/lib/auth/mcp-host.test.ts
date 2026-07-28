import { describe, it, expect, vi, beforeEach } from "vitest";

// Guard `server-only` and the Mongo/entity layers so the bearer host-gate can
// be unit-tested with fakes (no cluster, no real WorkOS verification here).
vi.mock("server-only", () => ({}));

// Hoisted so the vi.mock factory (also hoisted) can reference them.
const { FakeActorError, resolveActorFromBearer } = vi.hoisted(() => {
  class FakeActorError extends Error {
    status: number;
    constructor(message: string, status: number) {
      super(message);
      this.name = "ActorError";
      this.status = status;
    }
  }
  return { FakeActorError, resolveActorFromBearer: vi.fn() };
});

vi.mock("@/lib/auth/mcp-actor", () => ({
  resolveActorFromBearer: (...args: unknown[]) => resolveActorFromBearer(...args),
  ActorError: FakeActorError,
}));

const events = { findOne: vi.fn() };
vi.mock("@/lib/mongo/databases", () => ({
  eventsCollection: vi.fn(async () => events),
}));

const listHostEntitiesForPerson = vi.fn();
vi.mock("@/lib/mongo/entities", () => ({
  listHostEntitiesForPerson: (...args: unknown[]) => listHostEntitiesForPerson(...args),
}));

import { requireBearerEventHost, ActorError } from "./mcp-host";

const person = { _id: "person_1", workosUserId: "user_1" };

beforeEach(() => {
  vi.clearAllMocks();
  resolveActorFromBearer.mockResolvedValue(person);
  events.findOne.mockResolvedValue({ _id: "evt_1", name: "Sunset", primaryHostEntityId: "ent_1", hostEntityIds: [] });
  listHostEntitiesForPerson.mockResolvedValue([{ _id: "ent_1" }]);
});

describe("requireBearerEventHost", () => {
  it("returns { person, event } when the bearer's person hosts the event", async () => {
    const ctx = await requireBearerEventHost("Bearer tok", "evt_1");
    expect(ctx.person._id).toBe("person_1");
    expect(ctx.event._id).toBe("evt_1");
  });

  it("also accepts a host via hostEntityIds (not just primary)", async () => {
    events.findOne.mockResolvedValue({ _id: "evt_2", primaryHostEntityId: "ent_other", hostEntityIds: ["ent_1"] });
    const ctx = await requireBearerEventHost("Bearer tok", "evt_2");
    expect(ctx.event._id).toBe("evt_2");
  });

  it("propagates the actor 401 when unauthenticated", async () => {
    resolveActorFromBearer.mockRejectedValue(new FakeActorError("Authentication required.", 401));
    await expect(requireBearerEventHost(null, "evt_1")).rejects.toMatchObject({ status: 401 });
  });

  it("404s an unknown event", async () => {
    events.findOne.mockResolvedValue(null);
    await expect(requireBearerEventHost("Bearer tok", "nope")).rejects.toMatchObject({ status: 404 });
  });

  it("403s a signed-in person who does not host the event", async () => {
    listHostEntitiesForPerson.mockResolvedValue([{ _id: "ent_someone_else" }]);
    const err = await requireBearerEventHost("Bearer tok", "evt_1").catch((e) => e);
    expect(err).toBeInstanceOf(ActorError);
    expect(err.status).toBe(403);
  });
});
