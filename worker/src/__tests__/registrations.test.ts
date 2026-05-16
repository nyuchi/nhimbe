/**
 * Tests for /api/registrations. The route reads/writes Supabase via
 * supabaseFetch(), so we stub global fetch with a URL-pattern router that
 * returns canned PostgREST responses. The WorkOS JWT path (used by PUT for
 * host authz) is short-circuited by mocking ../auth/workos.
 *
 * What is covered:
 *   GET    — event_id query, user_id query, 400 when neither is supplied
 *   POST   — happy path (capacity check + RSVP insert + count bump),
 *            404 missing event, 400 not-public/not-scheduled, 400 at-capacity,
 *            400 already-registered, 400 malformed JSON, 400 missing fields
 *   PUT    — host approves, registrant self-confirm, non-host forbidden,
 *            unauthorized when no JWT, invalid status, 404 missing reg
 *   DELETE — cancel + count decrement, no-op when already cancelled
 *
 * What is NOT covered (left as known limitations of the current route):
 *   - The capacity check + insert race condition (CLAUDE.md flags this; the
 *     route comment says "to be replaced with a SQL function in a follow-up").
 *     Best-effort PATCH after insert means two concurrent registrations on a
 *     1-seat event can both succeed. A test asserting that misbehavior would
 *     be a regression trap, so we don't add one.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Hono } from "hono";
import type { Env } from "../types";
import { registrations } from "../routes/registrations";
import {
  createMockEnv,
  makeFetchStub,
  pgrstMatch,
  jsonResponse as json,
  noContent,
  notFoundSingle,
  trustedOriginHeaders as authHeaders,
} from "./mocks";

vi.mock("../auth/workos", () => ({
  getAuthenticatedUser: vi.fn(),
}));
import { getAuthenticatedUser } from "../auth/workos";
const mockedGetAuthenticatedUser = vi.mocked(getAuthenticatedUser);

function buildApp(env: Env) {
  const app = new Hono<{ Bindings: Env }>();
  app.route("/api/registrations", registrations);
  return {
    fetch: (path: string, init?: RequestInit) =>
      app.fetch(new Request(`http://localhost${path}`, init), env),
  };
}

beforeEach(() => {
  vi.unstubAllGlobals();
  mockedGetAuthenticatedUser.mockReset();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

// ============================================
// GET /api/registrations
// ============================================

describe("GET /api/registrations", () => {
  it("returns 400 when neither event_id nor user_id is supplied", async () => {
    const env = createMockEnv();
    const app = buildApp(env);
    const res = await app.fetch("/api/registrations");
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "event_id or user_id required" });
  });

  it("queries rsvp_action by event_id and maps rows to legacy shape", async () => {
    const env = createMockEnv();
    const { stub, calls } = makeFetchStub([
      {
        match: pgrstMatch("rsvp_action", ["GET"]),
        handle: () => json([
          {
            id: "rsvp-1",
            event_id: "evt-1",
            agent_person_id: "person-1",
            rsvpresponse: "rsvpYes",
            created_at: "2026-05-01T10:00:00Z",
            updated_at: null,
            confirmation_status: null,
            confirmed_at: null,
          },
        ]),
      },
    ]);
    vi.stubGlobal("fetch", stub);

    const app = buildApp(env);
    const res = await app.fetch("/api/registrations?event_id=evt-1");
    expect(res.status).toBe(200);
    const body = await res.json() as { registrations: Array<{ id: string; status: string }> };
    expect(body.registrations).toHaveLength(1);
    expect(body.registrations[0]).toMatchObject({
      id: "rsvp-1",
      eventId: "evt-1",
      userId: "person-1",
      status: "registered",
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("GET");
    const queriedUrl = new URL(calls[0].url);
    expect(queriedUrl.searchParams.get("event_id")).toBe("eq.evt-1");
  });

  it("queries rsvp_action by user_id when event_id is absent", async () => {
    const env = createMockEnv();
    const { stub, calls } = makeFetchStub([
      { match: pgrstMatch("rsvp_action", ["GET"]), handle: () => json([]) },
    ]);
    vi.stubGlobal("fetch", stub);

    const app = buildApp(env);
    const res = await app.fetch("/api/registrations?user_id=person-9");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ registrations: [] });

    const queriedUrl = new URL(calls[0].url);
    expect(queriedUrl.searchParams.get("agent_person_id")).toBe("eq.person-9");
    expect(queriedUrl.searchParams.has("event_id")).toBe(false);
  });

  it("derives status correctly for cancelled / approved / attended rows", async () => {
    const env = createMockEnv();
    const { stub } = makeFetchStub([
      {
        match: pgrstMatch("rsvp_action", ["GET"]),
        handle: () => json([
          { id: "1", event_id: "e", agent_person_id: "p1", rsvpresponse: "rsvpNo", created_at: "t", updated_at: "u", confirmation_status: null, confirmed_at: null },
          { id: "2", event_id: "e", agent_person_id: "p2", rsvpresponse: "rsvpYes", created_at: "t", updated_at: null, confirmation_status: "approved", confirmed_at: "c" },
          { id: "3", event_id: "e", agent_person_id: "p3", rsvpresponse: "rsvpYes", created_at: "t", updated_at: null, confirmation_status: "attended", confirmed_at: "c" },
          { id: "4", event_id: "e", agent_person_id: "p4", rsvpresponse: "rsvpYes", created_at: "t", updated_at: null, confirmation_status: "rejected", confirmed_at: "c" },
        ]),
      },
    ]);
    vi.stubGlobal("fetch", stub);

    const app = buildApp(env);
    const res = await app.fetch("/api/registrations?event_id=e");
    const body = await res.json() as { registrations: Array<{ status: string; cancelledAt: string | null }> };
    expect(body.registrations.map(r => r.status)).toEqual(["cancelled", "approved", "attended", "rejected"]);
    expect(body.registrations[0].cancelledAt).toBe("u");
  });
});

// ============================================
// POST /api/registrations
// ============================================

describe("POST /api/registrations", () => {
  it("rejects unauthenticated POST (no API key, no allowed origin)", async () => {
    const env = createMockEnv();
    const app = buildApp(env);
    const res = await app.fetch("/api/registrations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventId: "e", userId: "u" }),
    });
    expect(res.status).toBe(401);
  });

  it("400s on malformed JSON body", async () => {
    const env = createMockEnv();
    const app = buildApp(env);
    const res = await app.fetch("/api/registrations", {
      method: "POST",
      headers: authHeaders(),
      body: "not-json",
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid JSON body" });
  });

  it("400s when eventId or userId is missing", async () => {
    const env = createMockEnv();
    const app = buildApp(env);
    const res = await app.fetch("/api/registrations", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ eventId: "e" }),
    });
    expect(res.status).toBe(400);
  });

  it("404s when the event does not exist", async () => {
    const env = createMockEnv();
    const { stub } = makeFetchStub([
      // pgrst returns 406 from single=true when no rows, which supabaseFetch maps to null
      {
        match: pgrstMatch("event", ["GET"]),
        handle: () => notFoundSingle(),
      },
    ]);
    vi.stubGlobal("fetch", stub);

    const app = buildApp(env);
    const res = await app.fetch("/api/registrations", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ eventId: "missing", userId: "u" }),
    });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Event not found" });
  });

  it("400s when event is not public or not scheduled", async () => {
    const env = createMockEnv();
    const { stub } = makeFetchStub([
      {
        match: pgrstMatch("event", ["GET"]),
        handle: () => json({
          id: "e",
          maximumattendeecapacity: 100,
          attendee_count: 0,
          visibility: "draft",
          eventstatus: "EventScheduled",
        }),
      },
    ]);
    vi.stubGlobal("fetch", stub);

    const app = buildApp(env);
    const res = await app.fetch("/api/registrations", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ eventId: "e", userId: "u" }),
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Event is not available for registration" });
  });

  it("400s when event is at capacity", async () => {
    const env = createMockEnv();
    const { stub } = makeFetchStub([
      {
        match: pgrstMatch("event", ["GET"]),
        handle: () => json({
          id: "e",
          maximumattendeecapacity: 10,
          attendee_count: 10,
          visibility: "public",
          eventstatus: "EventScheduled",
        }),
      },
    ]);
    vi.stubGlobal("fetch", stub);

    const app = buildApp(env);
    const res = await app.fetch("/api/registrations", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ eventId: "e", userId: "u" }),
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Event is at capacity" });
  });

  it("400s when user already has a non-cancelled RSVP", async () => {
    const env = createMockEnv();
    const { stub } = makeFetchStub([
      {
        match: pgrstMatch("event", ["GET"]),
        handle: () => json({
          id: "e", maximumattendeecapacity: 100, attendee_count: 5, visibility: "public", eventstatus: "EventScheduled",
        }),
      },
      {
        match: pgrstMatch("rsvp_action", ["GET"]),
        handle: () => json({ id: "existing-rsvp" }),
      },
    ]);
    vi.stubGlobal("fetch", stub);

    const app = buildApp(env);
    const res = await app.fetch("/api/registrations", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ eventId: "e", userId: "u" }),
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "User is already registered for this event" });
  });

  it("inserts RSVP and bumps attendee_count on the happy path", async () => {
    const env = createMockEnv();
    const { stub, calls } = makeFetchStub([
      {
        match: pgrstMatch("event", ["GET"]),
        handle: () => json({
          id: "e", maximumattendeecapacity: 100, attendee_count: 5, visibility: "public", eventstatus: "EventScheduled",
        }),
      },
      {
        match: pgrstMatch("rsvp_action", ["GET"]),
        handle: () => notFoundSingle(), // no existing
      },
      {
        match: pgrstMatch("rsvp_action", ["POST"]),
        handle: () => json([{ id: "new-rsvp" }], 201),
      },
      {
        match: pgrstMatch("event", ["PATCH"]),
        handle: () => noContent(),
      },
    ]);
    vi.stubGlobal("fetch", stub);

    const app = buildApp(env);
    const res = await app.fetch("/api/registrations", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ eventId: "e", userId: "u" }),
    });
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ id: "new-rsvp", message: "Registration successful" });

    const insert = calls.find(c => c.method === "POST" && c.url.includes("/rsvp_action"));
    expect(insert).toBeDefined();
    expect(insert!.body).toMatchObject({
      event_id: "e",
      agent_person_id: "u",
      rsvpresponse: "rsvpYes",
    });

    const patch = calls.find(c => c.method === "PATCH" && c.url.includes("/event"));
    expect(patch).toBeDefined();
    expect(patch!.body).toEqual({ attendee_count: 6 });
  });
});

// ============================================
// PUT /api/registrations/:id
// ============================================

describe("PUT /api/registrations/:id", () => {
  it("400s on invalid status", async () => {
    const env = createMockEnv();
    const app = buildApp(env);
    const res = await app.fetch("/api/registrations/abc", {
      method: "PUT",
      headers: authHeaders(),
      body: JSON.stringify({ status: "bogus" }),
    });
    expect(res.status).toBe(400);
  });

  it("404s when the registration does not exist", async () => {
    const env = createMockEnv();
    const { stub } = makeFetchStub([
      {
        match: pgrstMatch("rsvp_action", ["GET"]),
        handle: () => notFoundSingle(),
      },
    ]);
    vi.stubGlobal("fetch", stub);

    const app = buildApp(env);
    const res = await app.fetch("/api/registrations/missing", {
      method: "PUT",
      headers: authHeaders(),
      body: JSON.stringify({ status: "approved" }),
    });
    expect(res.status).toBe(404);
  });

  it("401s when host action is attempted without a session JWT", async () => {
    const env = createMockEnv();
    mockedGetAuthenticatedUser.mockResolvedValue({ user: null, failureReason: "no_token" });
    const { stub } = makeFetchStub([
      {
        match: pgrstMatch("rsvp_action", ["GET"]),
        handle: () => json({ id: "r", event_id: "e", agent_person_id: "p" }),
      },
      {
        match: pgrstMatch("event", ["GET"]),
        handle: () => json({ organizer_person_id: "host-1" }),
      },
    ]);
    vi.stubGlobal("fetch", stub);

    const app = buildApp(env);
    const res = await app.fetch("/api/registrations/r", {
      method: "PUT",
      headers: authHeaders(),
      body: JSON.stringify({ status: "approved" }),
    });
    expect(res.status).toBe(401);
  });

  it("403s when non-host tries to approve", async () => {
    const env = createMockEnv();
    mockedGetAuthenticatedUser.mockResolvedValue({
      user: { userId: "workos|other", email: "other@nyuchi.com" },
    });
    const { stub } = makeFetchStub([
      {
        match: pgrstMatch("rsvp_action", ["GET"]),
        handle: () => json({ id: "r", event_id: "e", agent_person_id: "p" }),
      },
      {
        match: pgrstMatch("event", ["GET"]),
        handle: () => json({ organizer_person_id: "host-1" }),
      },
      {
        match: (url) => url.pathname === "/rest/v1/person",
        handle: () => json({ id: "not-host" }),
      },
    ]);
    vi.stubGlobal("fetch", stub);

    const app = buildApp(env);
    const res = await app.fetch("/api/registrations/r", {
      method: "PUT",
      headers: authHeaders(),
      body: JSON.stringify({ status: "approved" }),
    });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Only the event host can approve, reject, or mark attendance" });
  });

  it("lets the host approve a registration", async () => {
    const env = createMockEnv();
    mockedGetAuthenticatedUser.mockResolvedValue({
      user: { userId: "workos|host", email: "host@nyuchi.com" },
    });
    const { stub, calls } = makeFetchStub([
      {
        match: pgrstMatch("rsvp_action", ["GET"]),
        handle: () => json({ id: "r", event_id: "e", agent_person_id: "p" }),
      },
      {
        match: pgrstMatch("event", ["GET"]),
        handle: () => json({ organizer_person_id: "host-1" }),
      },
      {
        match: (url) => url.pathname === "/rest/v1/person",
        handle: () => json({ id: "host-1" }),
      },
      {
        match: pgrstMatch("rsvp_action", ["PATCH"]),
        handle: () => noContent(),
      },
    ]);
    vi.stubGlobal("fetch", stub);

    const app = buildApp(env);
    const res = await app.fetch("/api/registrations/r", {
      method: "PUT",
      headers: authHeaders(),
      body: JSON.stringify({ status: "approved" }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ message: "Registration approved" });

    const patch = calls.find(c => c.method === "PATCH" && c.url.includes("/rsvp_action"));
    expect(patch!.body).toMatchObject({ confirmation_status: "approved" });
  });

  it("lets the registrant self-update to 'registered'", async () => {
    const env = createMockEnv();
    mockedGetAuthenticatedUser.mockResolvedValue({
      user: { userId: "workos|self", email: "self@nyuchi.com" },
    });
    const { stub } = makeFetchStub([
      {
        match: pgrstMatch("rsvp_action", ["GET"]),
        handle: () => json({ id: "r", event_id: "e", agent_person_id: "person-self" }),
      },
      {
        match: pgrstMatch("event", ["GET"]),
        handle: () => json({ organizer_person_id: "host-1" }),
      },
      {
        match: (url) => url.pathname === "/rest/v1/person",
        handle: () => json({ id: "person-self" }),
      },
      {
        match: pgrstMatch("rsvp_action", ["PATCH"]),
        handle: () => noContent(),
      },
    ]);
    vi.stubGlobal("fetch", stub);

    const app = buildApp(env);
    const res = await app.fetch("/api/registrations/r", {
      method: "PUT",
      headers: authHeaders(),
      body: JSON.stringify({ status: "registered" }),
    });
    expect(res.status).toBe(200);
  });
});

// ============================================
// DELETE /api/registrations/:id
// ============================================

describe("DELETE /api/registrations/:id", () => {
  it("soft-cancels the RSVP and decrements attendee_count", async () => {
    const env = createMockEnv();
    let attendeeCount = 5;
    const { stub, calls } = makeFetchStub([
      {
        match: pgrstMatch("rsvp_action", ["GET"]),
        handle: () => json({ id: "r", event_id: "e", rsvpresponse: "rsvpYes" }),
      },
      {
        match: pgrstMatch("rsvp_action", ["PATCH"]),
        handle: () => noContent(),
      },
      {
        match: pgrstMatch("event", ["GET"]),
        handle: () => json({ attendee_count: attendeeCount }),
      },
      {
        match: pgrstMatch("event", ["PATCH"]),
        handle: ({ body }) => {
          attendeeCount = (body as { attendee_count: number }).attendee_count;
          return noContent();
        },
      },
    ]);
    vi.stubGlobal("fetch", stub);

    const app = buildApp(env);
    const res = await app.fetch("/api/registrations/r", {
      method: "DELETE",
      headers: authHeaders(),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ message: "Registration cancelled" });
    expect(attendeeCount).toBe(4);

    const rsvpPatch = calls.find(c => c.method === "PATCH" && c.url.includes("/rsvp_action"));
    expect(rsvpPatch!.body).toMatchObject({ rsvpresponse: "rsvpNo" });
  });

  it("does not double-decrement when RSVP is already cancelled", async () => {
    const env = createMockEnv();
    const { stub, calls } = makeFetchStub([
      {
        match: pgrstMatch("rsvp_action", ["GET"]),
        handle: () => json({ id: "r", event_id: "e", rsvpresponse: "rsvpNo" }),
      },
    ]);
    vi.stubGlobal("fetch", stub);

    const app = buildApp(env);
    const res = await app.fetch("/api/registrations/r", {
      method: "DELETE",
      headers: authHeaders(),
    });
    expect(res.status).toBe(200);

    const patchCalls = calls.filter(c => c.method === "PATCH");
    expect(patchCalls).toHaveLength(0);
  });

  it("returns 200 with cancellation message even when the registration is not found", async () => {
    // Current behaviour: the route doesn't surface "not found" on delete; it
    // just returns the generic cancellation message. Documented here so a
    // future change that returns 404 will be intentional, not accidental.
    const env = createMockEnv();
    const { stub } = makeFetchStub([
      {
        match: pgrstMatch("rsvp_action", ["GET"]),
        handle: () => notFoundSingle(),
      },
    ]);
    vi.stubGlobal("fetch", stub);

    const app = buildApp(env);
    const res = await app.fetch("/api/registrations/missing", {
      method: "DELETE",
      headers: authHeaders(),
    });
    expect(res.status).toBe(200);
  });
});
