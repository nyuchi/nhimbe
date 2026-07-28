import { describe, it, expect, vi, beforeEach } from "vitest";

// Unit-test the filter `listEvents` builds for the free-text `q` search (the
// MCP `search_events` backing), with fake collections — no cluster.
vi.mock("server-only", () => ({}));

let capturedFilter: Record<string, unknown> = {};

const findCursor = {
  sort: vi.fn(() => findCursor),
  skip: vi.fn(() => findCursor),
  limit: vi.fn(() => findCursor),
  toArray: vi.fn(async () => []),
};
const events = {
  find: vi.fn((filter: Record<string, unknown>) => {
    capturedFilter = filter;
    return findCursor;
  }),
  countDocuments: vi.fn(async () => 0),
};

vi.mock("@/lib/mongo/databases", () => ({
  eventsCollection: vi.fn(async () => events),
  entitiesCollection: vi.fn(async () => ({ find: () => ({ toArray: async () => [] }) })),
  placesCollection: vi.fn(async () => ({ find: () => ({ toArray: async () => [] }) })),
  personsCollection: vi.fn(async () => ({ find: () => ({ toArray: async () => [] }) })),
}));

import { listEvents } from "./events";

beforeEach(() => {
  vi.clearAllMocks();
  capturedFilter = {};
});

describe("listEvents free-text query", () => {
  it("matches name OR description, case-insensitively, alongside the published gate", async () => {
    await listEvents({ query: "jazz" });
    const and = capturedFilter.$and as Array<Record<string, unknown>>;
    expect(Array.isArray(and)).toBe(true);
    const or = and[0].$or as Array<Record<string, { $regex: string; $options: string }>>;
    expect(or.map((c) => Object.keys(c)[0])).toEqual(["name", "description"]);
    expect(or[0].name.$options).toBe("i");
    expect(or[0].name.$regex).toBe("jazz");
    // Published gate still applies.
    expect(capturedFilter.status).toBeDefined();
    expect((capturedFilter as Record<string, unknown>)["mukoko.visibility"]).toEqual({ $ne: "private" });
  });

  it("regex-escapes the query so operators can't be injected", async () => {
    await listEvents({ query: "a.*b(c)" });
    const and = capturedFilter.$and as Array<Record<string, unknown>>;
    const or = and[0].$or as Array<Record<string, { $regex: string }>>;
    expect(or[0].name.$regex).toBe("a\\.\\*b\\(c\\)");
  });

  it("composes query + city under $and without either clobbering the other's $or", async () => {
    await listEvents({ query: "jazz", city: "Harare" });
    const and = capturedFilter.$and as Array<Record<string, unknown>>;
    expect(and).toHaveLength(2);
    // First clause is the text $or, second is the city $or.
    expect(and[0].$or).toBeDefined();
    expect(and[1].$or).toBeDefined();
    expect(capturedFilter.$or).toBeUndefined();
  });

  it("omits $and entirely when neither query nor city is given", async () => {
    await listEvents({});
    expect(capturedFilter.$and).toBeUndefined();
  });
});
