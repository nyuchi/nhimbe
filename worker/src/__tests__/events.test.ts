/**
 * Tests for /api/events. Covers the core read + write paths against
 * supabaseFetch + the event_mapper. AI side-effects (indexEvent, embeddings,
 * Vectorize upserts) are exercised via the mock AI/Vectorize bindings;
 * we don't assert on the vector payload, only that the route doesn't crash.
 *
 * Coverage:
 *   GET    /                    — list with filters, default pagination
 *   GET    /trending            — view-count sort + isHot derivation
 *   GET    /:id                 — uuid + slug fallback, 404
 *   POST   /                    — creation, missing organiser id 400
 *   PUT    /:id                 — patch shape
 *   POST   /:id/cancel          — happy path, double-cancel 400, missing 404
 *   DELETE /:id                 — happy path + audit best-effort
 *   POST   /:id/view            — view_count increment
 *   GET    /:id/reviews         — aggregation + author name lookup
 *   POST   /:id/reviews         — validation, conflict on duplicate
 *   GET    /:id/stats           — Promise.all fan-out, derived fields
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Hono } from "hono";
import type { Env } from "../types";
import { events } from "../routes/events";
import {
  createMockEnv,
  makeFetchStub,
  pgrstMatch,
  jsonResponse as json,
  noContent,
  notFoundSingle,
  trustedOriginHeaders as authHeaders,
} from "./mocks";

function buildApp(env: Env) {
  const app = new Hono<{ Bindings: Env }>();
  app.route("/api/events", events);
  return {
    fetch: (path: string, init?: RequestInit) =>
      app.fetch(new Request(`http://localhost${path}`, init), env),
  };
}

// Minimal SupabaseEventRow used by every test that mocks GET /event.
function eventRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "evt-1",
    name: "Sample Event",
    description: "A gathering",
    startdate: "2026-06-01T10:00:00Z",
    enddate: "2026-06-01T12:00:00Z",
    eventattendancemode: "OfflineEventAttendanceMode",
    eventstatus: "EventScheduled",
    eventtype: "Event",
    location: { addresslocality: "Harare", addresscountry: "ZW" },
    organizer: { name: "Host", initials: "H" },
    organizer_person_id: "person-host",
    offers: null,
    category: "music",
    keywords: [],
    image: null,
    attendee_count: 0,
    maximumattendeecapacity: 100,
    slug: "sample-event",
    visibility: "public",
    sync_version: 1,
    created_at: "2026-05-01T00:00:00Z",
    timezone: "UTC",
    ...overrides,
  };
}

beforeEach(() => {
  vi.unstubAllGlobals();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

// ============================================
// GET /api/events
// ============================================

describe("GET /api/events", () => {
  it("returns a list with default pagination", async () => {
    const env = createMockEnv();
    const { stub, calls } = makeFetchStub([
      {
        match: pgrstMatch("event", ["GET"]),
        handle: () => json([eventRow(), eventRow({ id: "evt-2" })]),
      },
    ]);
    vi.stubGlobal("fetch", stub);

    const app = buildApp(env);
    const res = await app.fetch("/api/events");
    expect(res.status).toBe(200);
    const body = await res.json() as { events: unknown[]; pagination: { limit: number; offset: number } };
    expect(body.events).toHaveLength(2);
    expect(body.pagination).toMatchObject({ limit: 20, offset: 0 });

    const url = new URL(calls[0].url);
    expect(url.searchParams.get("limit")).toBe("20");
    expect(url.searchParams.get("offset")).toBe("0");
  });

  it("applies city and category filters", async () => {
    const env = createMockEnv();
    const { stub, calls } = makeFetchStub([
      { match: pgrstMatch("event", ["GET"]), handle: () => json([]) },
    ]);
    vi.stubGlobal("fetch", stub);

    const app = buildApp(env);
    await app.fetch("/api/events?city=Harare&category=music&limit=5");
    const url = new URL(calls[0].url);
    expect(url.searchParams.get("limit")).toBe("5");
    expect(url.searchParams.getAll("location->>addresslocality")).toContain("eq.Harare");
    expect(url.searchParams.getAll("category")).toContain("eq.music");
  });

  it("clamps oversized limits to 100", async () => {
    const env = createMockEnv();
    const { stub, calls } = makeFetchStub([
      { match: pgrstMatch("event", ["GET"]), handle: () => json([]) },
    ]);
    vi.stubGlobal("fetch", stub);

    const app = buildApp(env);
    await app.fetch("/api/events?limit=9999");
    expect(new URL(calls[0].url).searchParams.get("limit")).toBe("100");
  });
});

// ============================================
// GET /api/events/trending
// ============================================

describe("GET /api/events/trending", () => {
  it("marks views > 50 as isHot and views > 10 as trending", async () => {
    const env = createMockEnv();
    const { stub } = makeFetchStub([
      {
        match: pgrstMatch("event", ["GET"]),
        handle: () => json([
          eventRow({ id: "e-cold", view_count: 5 }),
          eventRow({ id: "e-warm", view_count: 20 }),
          eventRow({ id: "e-hot", view_count: 100 }),
        ]),
      },
    ]);
    vi.stubGlobal("fetch", stub);

    const app = buildApp(env);
    const res = await app.fetch("/api/events/trending");
    expect(res.status).toBe(200);
    const body = await res.json() as { events: Array<{ id: string; isHot: boolean; trend: number }> };
    expect(body.events.find(e => e.id === "e-cold")).toMatchObject({ isHot: false, trend: 0 });
    expect(body.events.find(e => e.id === "e-warm")).toMatchObject({ isHot: false, trend: 100 });
    expect(body.events.find(e => e.id === "e-hot")).toMatchObject({ isHot: true, trend: 100 });
  });
});

// ============================================
// GET /api/events/:id
// ============================================

describe("GET /api/events/:id", () => {
  it("returns the event when matched by uuid", async () => {
    const env = createMockEnv();
    const { stub, calls } = makeFetchStub([
      {
        match: pgrstMatch("event", ["GET"]),
        handle: ({ url }) => {
          if (url.searchParams.get("id") === "eq.evt-1") return json(eventRow());
          return notFoundSingle();
        },
      },
    ]);
    vi.stubGlobal("fetch", stub);

    const app = buildApp(env);
    const res = await app.fetch("/api/events/evt-1");
    expect(res.status).toBe(200);
    expect(calls).toHaveLength(1);
  });

  it("falls back to slug lookup when uuid lookup misses", async () => {
    const env = createMockEnv();
    const { stub, calls } = makeFetchStub([
      {
        match: pgrstMatch("event", ["GET"]),
        handle: ({ url }) => {
          if (url.searchParams.get("slug")) return json(eventRow({ slug: "my-event" }));
          return notFoundSingle();
        },
      },
    ]);
    vi.stubGlobal("fetch", stub);

    const app = buildApp(env);
    const res = await app.fetch("/api/events/my-event");
    expect(res.status).toBe(200);
    expect(calls).toHaveLength(2);
  });

  it("404s when neither lookup matches", async () => {
    const env = createMockEnv();
    const { stub } = makeFetchStub([
      { match: pgrstMatch("event", ["GET"]), handle: () => notFoundSingle() },
    ]);
    vi.stubGlobal("fetch", stub);

    const app = buildApp(env);
    const res = await app.fetch("/api/events/ghost");
    expect(res.status).toBe(404);
  });
});

// ============================================
// POST /api/events
// ============================================

describe("POST /api/events", () => {
  it("rejects unauthenticated POST", async () => {
    const env = createMockEnv();
    const app = buildApp(env);
    const res = await app.fetch("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "X", organizerPersonId: "p" }),
    });
    expect(res.status).toBe(401);
  });

  it("400s when organizerPersonId is missing", async () => {
    const env = createMockEnv();
    const app = buildApp(env);
    const res = await app.fetch("/api/events", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ name: "Concert" }),
    });
    expect(res.status).toBe(400);
  });

  it("creates an event with a generated slug + indexes it", async () => {
    const env = createMockEnv();
    const { stub, calls } = makeFetchStub([
      {
        match: pgrstMatch("event", ["POST"]),
        handle: ({ body }) => json([eventRow({ ...body as Record<string, unknown> })], 201),
      },
    ]);
    vi.stubGlobal("fetch", stub);

    const app = buildApp(env);
    const res = await app.fetch("/api/events", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        name: "African Tech Summit 2026",
        startDate: "2026-08-01T09:00:00Z",
        organizerPersonId: "person-host",
        location: { name: "Rainbow Towers", addressLocality: "Harare" },
      }),
    });
    expect(res.status).toBe(201);
    const post = calls.find(c => c.method === "POST");
    expect(post!.body).toMatchObject({
      name: "African Tech Summit 2026",
      slug: "african-tech-summit-2026",
      organizer_person_id: "person-host",
      visibility: "public",
    });
    // indexEvent runs AI.run + VECTORIZE.upsert as side-effects (mocks no-op).
    expect(env.AI.run).toHaveBeenCalled();
  });
});

// ============================================
// PUT /api/events/:id
// ============================================

describe("PUT /api/events/:id", () => {
  it("sends a patch with only the supplied fields", async () => {
    const env = createMockEnv();
    const { stub, calls } = makeFetchStub([
      {
        match: pgrstMatch("event", ["PATCH"]),
        handle: () => json([eventRow({ name: "New Title" })]),
      },
    ]);
    vi.stubGlobal("fetch", stub);

    const app = buildApp(env);
    const res = await app.fetch("/api/events/evt-1", {
      method: "PUT",
      headers: authHeaders(),
      body: JSON.stringify({ name: "New Title", description: "Updated" }),
    });
    expect(res.status).toBe(200);
    const patch = calls.find(c => c.method === "PATCH");
    expect(patch!.body).toEqual({ name: "New Title", description: "Updated" });
  });
});

// ============================================
// POST /api/events/:id/cancel
// ============================================

describe("POST /api/events/:id/cancel", () => {
  it("404s when the event does not exist", async () => {
    const env = createMockEnv();
    const { stub } = makeFetchStub([
      { match: pgrstMatch("event", ["GET"]), handle: () => notFoundSingle() },
    ]);
    vi.stubGlobal("fetch", stub);

    const app = buildApp(env);
    const res = await app.fetch("/api/events/missing/cancel", {
      method: "POST",
      headers: authHeaders(),
    });
    expect(res.status).toBe(404);
  });

  it("400s when the event is already cancelled", async () => {
    const env = createMockEnv();
    const { stub } = makeFetchStub([
      {
        match: pgrstMatch("event", ["GET"]),
        handle: () => json({ id: "evt-1", eventstatus: "EventCancelled" }),
      },
    ]);
    vi.stubGlobal("fetch", stub);

    const app = buildApp(env);
    const res = await app.fetch("/api/events/evt-1/cancel", {
      method: "POST",
      headers: authHeaders(),
    });
    expect(res.status).toBe(400);
  });

  it("patches eventstatus and writes an audit row", async () => {
    const env = createMockEnv();
    const { stub, calls } = makeFetchStub([
      {
        match: pgrstMatch("event", ["GET"]),
        handle: () => json({ id: "evt-1", eventstatus: "EventScheduled" }),
      },
      { match: pgrstMatch("event", ["PATCH"]), handle: () => noContent() },
      { match: pgrstMatch("activity_logs", ["POST"]), handle: () => json([{ id: "log" }], 201) },
    ]);
    vi.stubGlobal("fetch", stub);

    const app = buildApp(env);
    const res = await app.fetch("/api/events/evt-1/cancel", {
      method: "POST",
      headers: authHeaders(),
    });
    expect(res.status).toBe(200);
    const patch = calls.find(c => c.method === "PATCH");
    expect(patch!.body).toEqual({ eventstatus: "EventCancelled" });
    const audit = calls.find(c => c.method === "POST" && c.url.includes("/activity_logs"));
    expect(audit!.body).toMatchObject({ action: "event.cancelled" });
  });
});

// ============================================
// DELETE /api/events/:id
// ============================================

describe("DELETE /api/events/:id", () => {
  it("deletes the row + writes an audit row + removes from index", async () => {
    const env = createMockEnv();
    const { stub, calls } = makeFetchStub([
      { match: pgrstMatch("event", ["DELETE"]), handle: () => noContent() },
      { match: pgrstMatch("activity_logs", ["POST"]), handle: () => json([{ id: "log" }], 201) },
    ]);
    vi.stubGlobal("fetch", stub);

    const app = buildApp(env);
    const res = await app.fetch("/api/events/evt-1", {
      method: "DELETE",
      headers: authHeaders(),
    });
    expect(res.status).toBe(200);
    expect(calls.find(c => c.method === "DELETE")).toBeDefined();
    expect(env.VECTORIZE.deleteByIds).toHaveBeenCalledWith(["evt-1"]);
  });
});

// ============================================
// POST /api/events/:id/view
// ============================================

describe("POST /api/events/:id/view", () => {
  it("increments view_count by one", async () => {
    const env = createMockEnv();
    const { stub, calls } = makeFetchStub([
      {
        match: pgrstMatch("event", ["GET"]),
        handle: () => json({ view_count: 42 }),
      },
      { match: pgrstMatch("event", ["PATCH"]), handle: () => noContent() },
    ]);
    vi.stubGlobal("fetch", stub);

    const app = buildApp(env);
    const res = await app.fetch("/api/events/evt-1/view", {
      method: "POST",
      headers: authHeaders(),
    });
    expect(res.status).toBe(200);
    const patch = calls.find(c => c.method === "PATCH");
    expect(patch!.body).toEqual({ view_count: 43 });
  });

  it("does not patch when the event does not exist", async () => {
    const env = createMockEnv();
    const { stub, calls } = makeFetchStub([
      { match: pgrstMatch("event", ["GET"]), handle: () => notFoundSingle() },
    ]);
    vi.stubGlobal("fetch", stub);

    const app = buildApp(env);
    const res = await app.fetch("/api/events/missing/view", {
      method: "POST",
      headers: authHeaders(),
    });
    expect(res.status).toBe(200);
    expect(calls.find(c => c.method === "PATCH")).toBeUndefined();
  });
});

// ============================================
// GET /api/events/:id/reviews
// ============================================

describe("GET /api/events/:id/reviews", () => {
  it("aggregates rating distribution + average + author names", async () => {
    const env = createMockEnv();
    const { stub } = makeFetchStub([
      {
        match: pgrstMatch("review", ["GET"]),
        handle: () => json([
          { id: "r1", author: "p1", rating_value: 5, review_body: "Loved it", helpful_count: 3, created_at: "t" },
          { id: "r2", author: "p2", rating_value: 4, review_body: "Good", helpful_count: 0, created_at: "t" },
          { id: "r3", author: "p1", rating_value: 5, review_body: "Again", helpful_count: 1, created_at: "t" },
        ]),
      },
      {
        match: pgrstMatch("person", ["GET"]),
        handle: () => json([
          { id: "p1", name: "Tariro" },
          { id: "p2", name: "Chido" },
        ]),
      },
    ]);
    vi.stubGlobal("fetch", stub);

    const app = buildApp(env);
    const res = await app.fetch("/api/events/evt-1/reviews");
    expect(res.status).toBe(200);
    const body = await res.json() as {
      reviews: Array<{ userName: string; rating: number }>;
      stats: { averageRating: number; totalReviews: number; distribution: Record<string, number> };
    };
    expect(body.stats.totalReviews).toBe(3);
    expect(body.stats.averageRating).toBeCloseTo(14 / 3);
    expect(body.stats.distribution["5"]).toBe(2);
    expect(body.stats.distribution["4"]).toBe(1);
    expect(body.reviews[0].userName).toBe("Tariro");
  });

  it("returns empty stats when no reviews exist", async () => {
    const env = createMockEnv();
    const { stub } = makeFetchStub([
      { match: pgrstMatch("review", ["GET"]), handle: () => json([]) },
    ]);
    vi.stubGlobal("fetch", stub);

    const app = buildApp(env);
    const res = await app.fetch("/api/events/evt-1/reviews");
    const body = await res.json() as { stats: { totalReviews: number; averageRating: number } };
    expect(body.stats).toMatchObject({ totalReviews: 0, averageRating: 0 });
  });
});

// ============================================
// POST /api/events/:id/reviews
// ============================================

describe("POST /api/events/:id/reviews", () => {
  it("400s when rating is out of range", async () => {
    const env = createMockEnv();
    const app = buildApp(env);
    const res = await app.fetch("/api/events/evt-1/reviews", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ userId: "p1", rating: 7 }),
    });
    expect(res.status).toBe(400);
  });

  it("inserts a review + enqueues an analytics message", async () => {
    const env = createMockEnv();
    const { stub, calls } = makeFetchStub([
      {
        match: pgrstMatch("review", ["POST"]),
        handle: () => json([{ id: "rev-1" }], 201),
      },
    ]);
    vi.stubGlobal("fetch", stub);

    const app = buildApp(env);
    const res = await app.fetch("/api/events/evt-1/reviews", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ userId: "p1", rating: 5, reviewBody: "great" }),
    });
    expect(res.status).toBe(201);
    const post = calls[0];
    expect(post.body).toMatchObject({
      author: "p1",
      rating_value: 5,
      item_reviewed_id: "evt-1",
    });
    expect(env.ANALYTICS_QUEUE!.send).toHaveBeenCalledWith(
      expect.objectContaining({ type: "review", eventId: "evt-1" }),
    );
  });

  it("returns 409 when supabase insert fails (duplicate review)", async () => {
    const env = createMockEnv();
    const { stub } = makeFetchStub([
      { match: pgrstMatch("review", ["POST"]), handle: () => json({ error: "dupe" }, 409) },
    ]);
    vi.stubGlobal("fetch", stub);

    const app = buildApp(env);
    const res = await app.fetch("/api/events/evt-1/reviews", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ userId: "p1", rating: 5 }),
    });
    expect(res.status).toBe(409);
  });
});

// ============================================
// GET /api/events/:id/stats
// ============================================

describe("GET /api/events/:id/stats", () => {
  it("fans out to event, rsvp_action, check_in, referral", async () => {
    const env = createMockEnv();
    const { stub } = makeFetchStub([
      {
        match: pgrstMatch("event", ["GET"]),
        handle: () => json({ view_count: 75 }),
      },
      {
        match: pgrstMatch("rsvp_action", ["GET"]),
        handle: () => json([{ id: "1" }, { id: "2" }, { id: "3" }]),
      },
      {
        match: pgrstMatch("check_in", ["GET"]),
        handle: () => json([{ id: "ci1" }]),
      },
      {
        match: pgrstMatch("referral", ["GET"]),
        handle: () => json([{ id: "r1" }, { id: "r2" }]),
      },
    ]);
    vi.stubGlobal("fetch", stub);

    const app = buildApp(env);
    const res = await app.fetch("/api/events/evt-1/stats");
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      eventId: "evt-1",
      views: 75,
      rsvps: 3,
      checkins: 1,
      referrals: 2,
      isHot: true,
    });
  });
});
