/**
 * Tests for /api/registrations. The route reads/writes Supabase via
 * supabaseFetch(), so we stub global fetch with a URL-pattern router that
 * returns canned PostgREST responses. WorkOS JWT validation is short-
 * circuited by mocking ../auth/workos.
 *
 * After the auth-hardening pass every write derives identity from the JWT
 * — so every test that exercises POST/PUT/DELETE needs to mock
 * `getAuthenticatedUser` AND provide a `person` GET response that maps the
 * WorkOS userId back to an identity.person.id.
 *
 * What is covered:
 *   GET    — event_id (with organizer override), self user_id, 401 unauth'd,
 *            403 when peeking at another user's registrations
 *   POST   — happy path (capacity check + RSVP insert + count bump),
 *            400 malformed JSON, 400 missing eventId, 401 no JWT,
 *            404 missing event, 400 not-public, 400 at-capacity,
 *            400 already-registered, rollback on RPC failure
 *   PUT    — host approves, registrant self-confirm, 403 non-host, 401 no JWT,
 *            400 invalid status, 404 missing reg
 *   DELETE — registrant cancels, organizer cancels, 403 third party,
 *            401 no JWT, 404 missing reg, no-op when already cancelled
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
  trustedOriginHeaders as originOnlyHeaders,
  authedOriginHeaders,
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
    mockedGetAuthenticatedUser.mockResolvedValue({ user: { userId: "workos|p1" } });
    const { stub } = makeFetchStub([
      { match: pgrstMatch("person", ["GET"]), handle: () => json({ id: "person-1" }) },
    ]);
    vi.stubGlobal("fetch", stub);

    const res = await app.fetch("/api/registrations", {
      headers: { Authorization: "Bearer x" },
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "event_id or user_id required" });
  });

  it("401s when no JWT is supplied", async () => {
    const env = createMockEnv();
    const app = buildApp(env);
    mockedGetAuthenticatedUser.mockResolvedValue({ user: null, failureReason: "no_token" });

    const res = await app.fetch("/api/registrations?event_id=evt-1");
    expect(res.status).toBe(401);
  });

  it("queries rsvp_action by event_id and maps rows to legacy shape", async () => {
    const env = createMockEnv();
    mockedGetAuthenticatedUser.mockResolvedValue({ user: { userId: "workos|p1" } });
    const { stub, calls } = makeFetchStub([
      { match: pgrstMatch("person", ["GET"]), handle: () => json({ id: "person-1" }) },
      {
        match: pgrstMatch("rsvp_action", ["GET"]),
        handle: () => json([
          {
            id: "rsvp-1",
            event_id: "evt-1",
            agent_person_id: "person-1",
            rsvpresponse: "https://schema.org/RsvpResponseYes",
            created_at: "2026-05-01T10:00:00Z",
            updated_at: null,
            confirmation_status: null,
            confirmed_at: null,
          },
        ]),
      },
      { match: pgrstMatch("check_in", ["GET"]), handle: () => json([]) },
    ]);
    vi.stubGlobal("fetch", stub);

    const app = buildApp(env);
    const res = await app.fetch("/api/registrations?event_id=evt-1", {
      headers: { Authorization: "Bearer x" },
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { registrations: Array<{ id: string; status: string }> };
    expect(body.registrations).toHaveLength(1);
    expect(body.registrations[0]).toMatchObject({
      id: "rsvp-1",
      eventId: "evt-1",
      userId: "person-1",
      status: "registered",
    });

    const rsvpCall = calls.find((c) => c.url.includes("/rsvp_action") && c.method === "GET");
    expect(rsvpCall).toBeDefined();
    const rsvpUrl = new URL(rsvpCall!.url);
    expect(rsvpUrl.searchParams.get("event_id")).toBe("eq.evt-1");
    const checkInCall = calls.find((c) => c.url.includes("/check_in"));
    const checkInUrl = new URL(checkInCall!.url);
    expect(checkInUrl.searchParams.get("event_id")).toBe("eq.evt-1");
  });

  it("queries rsvp_action by user_id when event_id is absent (self)", async () => {
    const env = createMockEnv();
    mockedGetAuthenticatedUser.mockResolvedValue({ user: { userId: "workos|self" } });
    const { stub, calls } = makeFetchStub([
      { match: pgrstMatch("person", ["GET"]), handle: () => json({ id: "person-9" }) },
      { match: pgrstMatch("rsvp_action", ["GET"]), handle: () => json([]) },
      { match: pgrstMatch("check_in", ["GET"]), handle: () => json([]) },
    ]);
    vi.stubGlobal("fetch", stub);

    const app = buildApp(env);
    const res = await app.fetch("/api/registrations?user_id=person-9", {
      headers: { Authorization: "Bearer x" },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      registrations: [],
      pagination: { limit: 100, offset: 0, total: 0 },
    });

    const rsvpCall = calls.find((c) => c.url.includes("/rsvp_action"));
    const queriedUrl = new URL(rsvpCall!.url);
    expect(queriedUrl.searchParams.get("agent_person_id")).toBe("eq.person-9");
  });

  it("403s when requester asks for another user's registrations without organizer/admin context", async () => {
    const env = createMockEnv();
    mockedGetAuthenticatedUser.mockResolvedValue({ user: { userId: "workos|other" } });
    const { stub } = makeFetchStub([
      { match: pgrstMatch("person", ["GET"]), handle: () => json({ id: "person-other" }) },
    ]);
    vi.stubGlobal("fetch", stub);

    const app = buildApp(env);
    const res = await app.fetch("/api/registrations?user_id=person-target", {
      headers: { Authorization: "Bearer x" },
    });
    expect(res.status).toBe(403);
  });

  it("derives status correctly including 'attended' from check_in join", async () => {
    const env = createMockEnv();
    mockedGetAuthenticatedUser.mockResolvedValue({ user: { userId: "workos|p1" } });
    const { stub } = makeFetchStub([
      { match: pgrstMatch("person", ["GET"]), handle: () => json({ id: "person-1" }) },
      {
        match: pgrstMatch("rsvp_action", ["GET"]),
        handle: () => json([
          { id: "1", event_id: "e", agent_person_id: "p1", rsvpresponse: "https://schema.org/RsvpResponseNo", created_at: "t", updated_at: "u", confirmation_status: null, confirmed_at: null },
          { id: "2", event_id: "e", agent_person_id: "p2", rsvpresponse: "https://schema.org/RsvpResponseYes", created_at: "t", updated_at: null, confirmation_status: "confirmed", confirmed_at: "c" },
          { id: "3", event_id: "e", agent_person_id: "p3", rsvpresponse: "https://schema.org/RsvpResponseYes", created_at: "t", updated_at: null, confirmation_status: "waitlisted", confirmed_at: null },
          { id: "4", event_id: "e", agent_person_id: "p4", rsvpresponse: "https://schema.org/RsvpResponseYes", created_at: "t", updated_at: null, confirmation_status: "declined", confirmed_at: "c" },
          { id: "5", event_id: "e", agent_person_id: "p5", rsvpresponse: "https://schema.org/RsvpResponseYes", created_at: "t", updated_at: null, confirmation_status: "confirmed", confirmed_at: "c" },
        ]),
      },
      {
        match: pgrstMatch("check_in", ["GET"]),
        handle: () => json([
          { event_id: "e", person_id: "p5", checked_in_at: "2026-05-02T10:00:00Z" },
        ]),
      },
    ]);
    vi.stubGlobal("fetch", stub);

    const app = buildApp(env);
    const res = await app.fetch("/api/registrations?event_id=e", {
      headers: { Authorization: "Bearer x" },
    });
    const body = await res.json() as { registrations: Array<{ status: string; cancelledAt: string | null; checkedInAt: string | null }> };
    expect(body.registrations.map(r => r.status)).toEqual(["cancelled", "approved", "waitlisted", "rejected", "attended"]);
    expect(body.registrations[0].cancelledAt).toBe("u");
    expect(body.registrations[4].checkedInAt).toBe("2026-05-02T10:00:00Z");
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
      body: JSON.stringify({ eventId: "e" }),
    });
    expect(res.status).toBe(401);
  });

  it("401s when no JWT is present", async () => {
    const env = createMockEnv();
    mockedGetAuthenticatedUser.mockResolvedValue({ user: null, failureReason: "no_token" });
    const app = buildApp(env);
    const res = await app.fetch("/api/registrations", {
      method: "POST",
      headers: originOnlyHeaders(),
      body: JSON.stringify({ eventId: "e" }),
    });
    expect(res.status).toBe(401);
  });

  it("400s on malformed JSON body", async () => {
    const env = createMockEnv();
    const app = buildApp(env);
    const res = await app.fetch("/api/registrations", {
      method: "POST",
      headers: originOnlyHeaders(),
      body: "not-json",
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid JSON body" });
  });

  it("400s when eventId is missing", async () => {
    const env = createMockEnv();
    const app = buildApp(env);
    const res = await app.fetch("/api/registrations", {
      method: "POST",
      headers: originOnlyHeaders(),
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  it("404s when the event does not exist", async () => {
    const env = createMockEnv();
    mockedGetAuthenticatedUser.mockResolvedValue({ user: { userId: "workos|p1" } });
    const { stub } = makeFetchStub([
      { match: pgrstMatch("person", ["GET"]), handle: () => json({ id: "person-1" }) },
      { match: pgrstMatch("event", ["GET"]), handle: () => notFoundSingle() },
    ]);
    vi.stubGlobal("fetch", stub);

    const app = buildApp(env);
    const res = await app.fetch("/api/registrations", {
      method: "POST",
      headers: authedOriginHeaders(),
      body: JSON.stringify({ eventId: "missing" }),
    });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Event not found" });
  });

  it("400s when event is not public or not scheduled", async () => {
    const env = createMockEnv();
    mockedGetAuthenticatedUser.mockResolvedValue({ user: { userId: "workos|p1" } });
    const { stub } = makeFetchStub([
      { match: pgrstMatch("person", ["GET"]), handle: () => json({ id: "person-1" }) },
      {
        match: pgrstMatch("event", ["GET"]),
        handle: () => json({
          id: "e",
          maximumattendeecapacity: 100,
          attendee_count: 0,
          visibility: "draft",
          eventstatus: "https://schema.org/EventScheduled",
        }),
      },
    ]);
    vi.stubGlobal("fetch", stub);

    const app = buildApp(env);
    const res = await app.fetch("/api/registrations", {
      method: "POST",
      headers: authedOriginHeaders(),
      body: JSON.stringify({ eventId: "e" }),
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Event is not available for registration" });
  });

  it("400s when event is at capacity", async () => {
    const env = createMockEnv();
    mockedGetAuthenticatedUser.mockResolvedValue({ user: { userId: "workos|p1" } });
    const { stub } = makeFetchStub([
      { match: pgrstMatch("person", ["GET"]), handle: () => json({ id: "person-1" }) },
      {
        match: pgrstMatch("event", ["GET"]),
        handle: () => json({
          id: "e",
          maximumattendeecapacity: 10,
          attendee_count: 10,
          visibility: "public",
          eventstatus: "https://schema.org/EventScheduled",
        }),
      },
    ]);
    vi.stubGlobal("fetch", stub);

    const app = buildApp(env);
    const res = await app.fetch("/api/registrations", {
      method: "POST",
      headers: authedOriginHeaders(),
      body: JSON.stringify({ eventId: "e" }),
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Event is at capacity" });
  });

  it("400s when user already has a non-cancelled RSVP", async () => {
    const env = createMockEnv();
    mockedGetAuthenticatedUser.mockResolvedValue({ user: { userId: "workos|p1" } });
    const { stub } = makeFetchStub([
      { match: pgrstMatch("person", ["GET"]), handle: () => json({ id: "person-1" }) },
      {
        match: pgrstMatch("event", ["GET"]),
        handle: () => json({
          id: "e", maximumattendeecapacity: 100, attendee_count: 5, visibility: "public", eventstatus: "https://schema.org/EventScheduled",
        }),
      },
      { match: pgrstMatch("rsvp_action", ["GET"]), handle: () => json({ id: "existing-rsvp" }) },
    ]);
    vi.stubGlobal("fetch", stub);

    const app = buildApp(env);
    const res = await app.fetch("/api/registrations", {
      method: "POST",
      headers: authedOriginHeaders(),
      body: JSON.stringify({ eventId: "e" }),
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "User is already registered for this event" });
  });

  it("inserts RSVP and bumps attendee_count atomically on the happy path", async () => {
    const env = createMockEnv();
    mockedGetAuthenticatedUser.mockResolvedValue({ user: { userId: "workos|p1" } });
    const { stub, calls } = makeFetchStub([
      { match: pgrstMatch("person", ["GET"]), handle: () => json({ id: "person-1" }) },
      {
        match: pgrstMatch("event", ["GET"]),
        handle: () => json({
          id: "e", maximumattendeecapacity: 100, attendee_count: 5, visibility: "public", eventstatus: "https://schema.org/EventScheduled",
        }),
      },
      { match: pgrstMatch("rsvp_action", ["GET"]), handle: () => notFoundSingle() },
      { match: pgrstMatch("rsvp_action", ["POST"]), handle: () => json([{ id: "new-rsvp" }], 201) },
      { match: pgrstMatch("rpc/try_register_attendee", ["POST"]), handle: () => json(6) },
    ]);
    vi.stubGlobal("fetch", stub);

    const app = buildApp(env);
    const res = await app.fetch("/api/registrations", {
      method: "POST",
      headers: authedOriginHeaders(),
      body: JSON.stringify({ eventId: "e" }),
    });
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ id: "new-rsvp", message: "Registration successful" });

    const insert = calls.find(c => c.method === "POST" && c.url.includes("/rsvp_action"));
    expect(insert).toBeDefined();
    expect(insert!.body).toMatchObject({
      event_id: "e",
      agent_person_id: "person-1",
      rsvpresponse: "https://schema.org/RsvpResponseYes",
    });

    const rpc = calls.find(c => c.method === "POST" && c.url.includes("/rpc/try_register_attendee"));
    expect(rpc).toBeDefined();
    expect(rpc!.body).toEqual({ p_event_id: "e" });
  });

  it("rolls back the RSVP when the atomic capacity RPC rejects (race lost)", async () => {
    const env = createMockEnv();
    mockedGetAuthenticatedUser.mockResolvedValue({ user: { userId: "workos|p1" } });
    const { stub, calls } = makeFetchStub([
      { match: pgrstMatch("person", ["GET"]), handle: () => json({ id: "person-1" }) },
      {
        match: pgrstMatch("event", ["GET"]),
        handle: () => json({
          id: "e", maximumattendeecapacity: 100, attendee_count: 99, visibility: "public", eventstatus: "https://schema.org/EventScheduled",
        }),
      },
      { match: pgrstMatch("rsvp_action", ["GET"]), handle: () => notFoundSingle() },
      { match: pgrstMatch("rsvp_action", ["POST"]), handle: () => json([{ id: "doomed-rsvp" }], 201) },
      { match: pgrstMatch("rpc/try_register_attendee", ["POST"]), handle: () => json(null) },
      { match: pgrstMatch("rsvp_action", ["DELETE"]), handle: () => noContent() },
    ]);
    vi.stubGlobal("fetch", stub);

    const app = buildApp(env);
    const res = await app.fetch("/api/registrations", {
      method: "POST",
      headers: authedOriginHeaders(),
      body: JSON.stringify({ eventId: "e" }),
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Event is at capacity" });

    const del = calls.find(c => c.method === "DELETE" && c.url.includes("/rsvp_action"));
    expect(del).toBeDefined();
    expect(new URL(del!.url).searchParams.get("id")).toBe("eq.doomed-rsvp");
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
      headers: originOnlyHeaders(),
      body: JSON.stringify({ status: "bogus" }),
    });
    expect(res.status).toBe(400);
  });

  it("404s when the registration does not exist", async () => {
    const env = createMockEnv();
    const { stub } = makeFetchStub([
      { match: pgrstMatch("rsvp_action", ["GET"]), handle: () => notFoundSingle() },
    ]);
    vi.stubGlobal("fetch", stub);

    const app = buildApp(env);
    const res = await app.fetch("/api/registrations/missing", {
      method: "PUT",
      headers: originOnlyHeaders(),
      body: JSON.stringify({ status: "approved" }),
    });
    expect(res.status).toBe(404);
  });

  it("401s when host action is attempted without a session JWT", async () => {
    const env = createMockEnv();
    mockedGetAuthenticatedUser.mockResolvedValue({ user: null, failureReason: "no_token" });
    const { stub } = makeFetchStub([
      { match: pgrstMatch("rsvp_action", ["GET"]), handle: () => json({ id: "r", event_id: "e", agent_person_id: "p" }) },
      { match: pgrstMatch("event", ["GET"]), handle: () => json({ organizer_person_id: "host-1" }) },
    ]);
    vi.stubGlobal("fetch", stub);

    const app = buildApp(env);
    const res = await app.fetch("/api/registrations/r", {
      method: "PUT",
      headers: originOnlyHeaders(),
      body: JSON.stringify({ status: "approved" }),
    });
    expect(res.status).toBe(401);
  });

  it("403s when non-host tries to approve", async () => {
    const env = createMockEnv();
    mockedGetAuthenticatedUser.mockResolvedValue({ user: { userId: "workos|other" } });
    const { stub } = makeFetchStub([
      { match: pgrstMatch("rsvp_action", ["GET"]), handle: () => json({ id: "r", event_id: "e", agent_person_id: "p" }) },
      { match: pgrstMatch("event", ["GET"]), handle: () => json({ organizer_person_id: "host-1" }) },
      { match: pgrstMatch("person", ["GET"]), handle: () => json({ id: "not-host" }) },
    ]);
    vi.stubGlobal("fetch", stub);

    const app = buildApp(env);
    const res = await app.fetch("/api/registrations/r", {
      method: "PUT",
      headers: authedOriginHeaders(),
      body: JSON.stringify({ status: "approved" }),
    });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Only the event host can approve or reject" });
  });

  it("lets the host approve a registration", async () => {
    const env = createMockEnv();
    mockedGetAuthenticatedUser.mockResolvedValue({ user: { userId: "workos|host" } });
    const { stub, calls } = makeFetchStub([
      { match: pgrstMatch("rsvp_action", ["GET"]), handle: () => json({ id: "r", event_id: "e", agent_person_id: "p" }) },
      { match: pgrstMatch("event", ["GET"]), handle: () => json({ organizer_person_id: "host-1" }) },
      { match: pgrstMatch("person", ["GET"]), handle: () => json({ id: "host-1" }) },
      { match: pgrstMatch("rsvp_action", ["PATCH"]), handle: () => noContent() },
    ]);
    vi.stubGlobal("fetch", stub);

    const app = buildApp(env);
    const res = await app.fetch("/api/registrations/r", {
      method: "PUT",
      headers: authedOriginHeaders(),
      body: JSON.stringify({ status: "approved" }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ message: "Registration approved" });

    const patch = calls.find(c => c.method === "PATCH" && c.url.includes("/rsvp_action"));
    expect(patch!.body).toMatchObject({ confirmation_status: "confirmed" });
  });

  it("lets the registrant self-update to 'registered'", async () => {
    const env = createMockEnv();
    mockedGetAuthenticatedUser.mockResolvedValue({ user: { userId: "workos|self" } });
    const { stub } = makeFetchStub([
      { match: pgrstMatch("rsvp_action", ["GET"]), handle: () => json({ id: "r", event_id: "e", agent_person_id: "person-self" }) },
      { match: pgrstMatch("event", ["GET"]), handle: () => json({ organizer_person_id: "host-1" }) },
      { match: pgrstMatch("person", ["GET"]), handle: () => json({ id: "person-self" }) },
      { match: pgrstMatch("rsvp_action", ["PATCH"]), handle: () => noContent() },
    ]);
    vi.stubGlobal("fetch", stub);

    const app = buildApp(env);
    const res = await app.fetch("/api/registrations/r", {
      method: "PUT",
      headers: authedOriginHeaders(),
      body: JSON.stringify({ status: "registered" }),
    });
    expect(res.status).toBe(200);
  });
});

// ============================================
// DELETE /api/registrations/:id
// ============================================

describe("DELETE /api/registrations/:id", () => {
  it("401s when no JWT", async () => {
    const env = createMockEnv();
    mockedGetAuthenticatedUser.mockResolvedValue({ user: null, failureReason: "no_token" });

    const app = buildApp(env);
    const res = await app.fetch("/api/registrations/r", {
      method: "DELETE",
      headers: originOnlyHeaders(),
    });
    expect(res.status).toBe(401);
  });

  it("403s when requester is neither registrant nor organizer", async () => {
    const env = createMockEnv();
    mockedGetAuthenticatedUser.mockResolvedValue({ user: { userId: "workos|other" } });
    const { stub } = makeFetchStub([
      { match: pgrstMatch("person", ["GET"]), handle: () => json({ id: "person-other" }) },
      {
        match: pgrstMatch("rsvp_action", ["GET"]),
        handle: () => json({ id: "r", event_id: "e", agent_person_id: "registrant", rsvpresponse: "https://schema.org/RsvpResponseYes" }),
      },
      { match: pgrstMatch("event", ["GET"]), handle: () => json({ organizer_person_id: "host-1" }) },
    ]);
    vi.stubGlobal("fetch", stub);

    const app = buildApp(env);
    const res = await app.fetch("/api/registrations/r", {
      method: "DELETE",
      headers: authedOriginHeaders(),
    });
    expect(res.status).toBe(403);
  });

  it("registrant soft-cancels and decrements attendee_count atomically", async () => {
    const env = createMockEnv();
    mockedGetAuthenticatedUser.mockResolvedValue({ user: { userId: "workos|reg" } });
    const { stub, calls } = makeFetchStub([
      { match: pgrstMatch("person", ["GET"]), handle: () => json({ id: "person-reg" }) },
      {
        match: pgrstMatch("rsvp_action", ["GET"]),
        handle: () => json({ id: "r", event_id: "e", agent_person_id: "person-reg", rsvpresponse: "https://schema.org/RsvpResponseYes" }),
      },
      { match: pgrstMatch("rsvp_action", ["PATCH"]), handle: () => noContent() },
      { match: pgrstMatch("rpc/decrement_attendee_count", ["POST"]), handle: () => json(4) },
      { match: pgrstMatch("activity_logs", ["POST"]), handle: () => json([{ id: "log-1" }], 201) },
    ]);
    vi.stubGlobal("fetch", stub);

    const app = buildApp(env);
    const res = await app.fetch("/api/registrations/r", {
      method: "DELETE",
      headers: authedOriginHeaders(),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ message: "Registration cancelled" });

    const rsvpPatch = calls.find(c => c.method === "PATCH" && c.url.includes("/rsvp_action"));
    expect(rsvpPatch!.body).toMatchObject({ rsvpresponse: "https://schema.org/RsvpResponseNo" });

    const rpc = calls.find(c => c.method === "POST" && c.url.includes("/rpc/decrement_attendee_count"));
    expect(rpc).toBeDefined();
    expect(rpc!.body).toEqual({ p_event_id: "e" });
  });

  it("does not double-decrement when RSVP is already cancelled", async () => {
    const env = createMockEnv();
    mockedGetAuthenticatedUser.mockResolvedValue({ user: { userId: "workos|reg" } });
    const { stub, calls } = makeFetchStub([
      { match: pgrstMatch("person", ["GET"]), handle: () => json({ id: "person-reg" }) },
      {
        match: pgrstMatch("rsvp_action", ["GET"]),
        handle: () => json({ id: "r", event_id: "e", agent_person_id: "person-reg", rsvpresponse: "https://schema.org/RsvpResponseNo" }),
      },
    ]);
    vi.stubGlobal("fetch", stub);

    const app = buildApp(env);
    const res = await app.fetch("/api/registrations/r", {
      method: "DELETE",
      headers: authedOriginHeaders(),
    });
    expect(res.status).toBe(200);

    const patchCalls = calls.filter(c => c.method === "PATCH");
    expect(patchCalls).toHaveLength(0);
  });

  it("returns 404 when the registration is not found", async () => {
    const env = createMockEnv();
    mockedGetAuthenticatedUser.mockResolvedValue({ user: { userId: "workos|reg" } });
    const { stub } = makeFetchStub([
      { match: pgrstMatch("person", ["GET"]), handle: () => json({ id: "person-reg" }) },
      { match: pgrstMatch("rsvp_action", ["GET"]), handle: () => notFoundSingle() },
    ]);
    vi.stubGlobal("fetch", stub);

    const app = buildApp(env);
    const res = await app.fetch("/api/registrations/missing", {
      method: "DELETE",
      headers: authedOriginHeaders(),
    });
    expect(res.status).toBe(404);
  });
});
