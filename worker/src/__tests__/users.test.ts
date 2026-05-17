/**
 * Tests for /api/users. Read paths hit identity.person and engagement.referral
 * via supabaseFetch; the soft-delete path also anonymises email through
 * crypto.subtle.digest (which Node 20+ supports natively) and writes an
 * audit row that silently swallows errors.
 *
 * Coverage:
 *   GET    /:id                  — uuid lookup, fallback to alternatename, 404
 *   POST   /                     — creation with defaults
 *   GET    /:id/referral-code    — code + aggregated counters, 404
 *   POST   /:id/referral-code    — creation, 409 on duplicate
 *   GET    /:id/reputation       — 404 missing user, badge derivation
 *   DELETE /:id                  — soft delete, PII anonymisation, audit best-effort
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Hono } from "hono";
import type { Env } from "../types";
import { users } from "../routes/users";
import {
  createMockEnv,
  makeFetchStub,
  pgrstMatch,
  jsonResponse as json,
  noContent,
  notFoundSingle,
  trustedOriginHeaders,
  authedOriginHeaders,
} from "./mocks";

// Pure-read endpoints don't require a JWT, so they keep using the
// origin-only header set. Write endpoints below send a Bearer token via
// `authedOriginHeaders()` and rely on the mocked workos validator.
const authHeaders = trustedOriginHeaders;

vi.mock("../auth/workos", () => ({
  getAuthenticatedUser: vi.fn(),
}));
import { getAuthenticatedUser } from "../auth/workos";
const mockedGetAuthenticatedUser = vi.mocked(getAuthenticatedUser);

function buildApp(env: Env) {
  const app = new Hono<{ Bindings: Env }>();
  app.route("/api/users", users);
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
// GET /api/users/:id
// ============================================

describe("GET /api/users/:id", () => {
  it("returns the user when matched by uuid", async () => {
    const env = createMockEnv();
    const { stub, calls } = makeFetchStub([
      {
        match: pgrstMatch("person", ["GET"]),
        handle: ({ url }) => {
          if (url.searchParams.get("id")?.startsWith("eq.")) {
            return json({
              id: "person-1",
              name: "Tariro Moyo",
              alternatename: "tariro",
              image: null,
              address: { addresslocality: "Harare", addresscountry: "ZW" },
              knowsabout: ["music", "tech"],
              onboarding_completed: true,
              role: "user",
              email: "tariro@example.com",
              created_at: "2026-01-01T00:00:00Z",
            });
          }
          return notFoundSingle();
        },
      },
    ]);
    vi.stubGlobal("fetch", stub);

    const app = buildApp(env);
    const res = await app.fetch("/api/users/person-1");
    expect(res.status).toBe(200);
    const body = await res.json() as { user: { id: string; addressLocality: string; interests: string[] } };
    expect(body.user.id).toBe("person-1");
    expect(body.user.addressLocality).toBe("Harare");
    expect(body.user.interests).toEqual(["music", "tech"]);

    // First query is by id; only one hit needed.
    expect(calls).toHaveLength(1);
    expect(new URL(calls[0].url).searchParams.get("id")).toBe("eq.person-1");
  });

  it("falls back to alternatename when the uuid lookup misses", async () => {
    const env = createMockEnv();
    const { stub, calls } = makeFetchStub([
      {
        match: pgrstMatch("person", ["GET"]),
        handle: ({ url }) => {
          if (url.searchParams.get("id")) return notFoundSingle();
          if (url.searchParams.get("alternatename") === "eq.tariro") {
            return json({
              id: "person-1",
              name: "Tariro Moyo",
              alternatename: "tariro",
              image: null,
              address: {},
              knowsabout: [],
              onboarding_completed: true,
              role: "user",
              email: null,
              created_at: null,
            });
          }
          return notFoundSingle();
        },
      },
    ]);
    vi.stubGlobal("fetch", stub);

    const app = buildApp(env);
    const res = await app.fetch("/api/users/tariro");
    expect(res.status).toBe(200);
    expect(calls).toHaveLength(2);
  });

  it("404s when neither lookup matches", async () => {
    const env = createMockEnv();
    const { stub } = makeFetchStub([
      { match: pgrstMatch("person", ["GET"]), handle: () => notFoundSingle() },
    ]);
    vi.stubGlobal("fetch", stub);

    const app = buildApp(env);
    const res = await app.fetch("/api/users/ghost");
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "User not found" });
  });
});

// ============================================
// POST /api/users
// ============================================

describe("POST /api/users", () => {
  it("rejects unauthenticated POST", async () => {
    const env = createMockEnv();
    const app = buildApp(env);
    const res = await app.fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "X" }),
    });
    expect(res.status).toBe(401);
  });

  it("inserts a new person with defaults filled in", async () => {
    const env = createMockEnv();
    const { stub, calls } = makeFetchStub([
      {
        match: pgrstMatch("person", ["POST"]),
        handle: () => json([{ id: "new-person" }], 201),
      },
    ]);
    vi.stubGlobal("fetch", stub);

    const app = buildApp(env);
    const res = await app.fetch("/api/users", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        email: "new@example.com",
        name: "Rumbi",
        alternateName: "rumbi",
        addressLocality: "Bulawayo",
        addressCountry: "ZW",
        interests: ["art"],
      }),
    });
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ id: "new-person", message: "User created successfully" });

    const post = calls.find(c => c.method === "POST" && c.url.includes("/person"));
    expect(post!.body).toMatchObject({
      email: "new@example.com",
      name: "Rumbi",
      alternatename: "rumbi",
      address: { addresslocality: "Bulawayo", addresscountry: "ZW" },
      knowsabout: ["art"],
      role: "user",
    });
  });

  it("defaults missing fields to safe values", async () => {
    const env = createMockEnv();
    const { stub, calls } = makeFetchStub([
      {
        match: pgrstMatch("person", ["POST"]),
        handle: () => json([{ id: "new" }], 201),
      },
    ]);
    vi.stubGlobal("fetch", stub);

    const app = buildApp(env);
    await app.fetch("/api/users", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({}),
    });
    const post = calls[0];
    expect(post.body).toMatchObject({
      email: null,
      name: "Unknown",
      knowsabout: [],
      role: "user",
    });
  });
});

// ============================================
// GET /api/users/:id/referral-code
// ============================================

describe("GET /api/users/:id/referral-code", () => {
  it("returns the code plus aggregated counters", async () => {
    const env = createMockEnv();
    const { stub } = makeFetchStub([
      {
        match: pgrstMatch("referral", ["GET"]),
        handle: ({ url }) => {
          // First call is single=true to look up the code for this user.
          if (url.searchParams.get("limit") === "1") return json({ code: "NHMB123" });
          // Second call lists all rows with that code.
          if (url.searchParams.get("code") === "eq.NHMB123") {
            return json([
              { status: "pending" },
              { status: "converted" },
              { status: "converted" },
              { status: "expired" },
            ]);
          }
          return json([]);
        },
      },
    ]);
    vi.stubGlobal("fetch", stub);

    const app = buildApp(env);
    const res = await app.fetch("/api/users/person-1/referral-code");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      code: "NHMB123",
      totalReferrals: 4,
      totalConversions: 2,
    });
  });

  it("404s when the user has no personal code yet", async () => {
    const env = createMockEnv();
    const { stub } = makeFetchStub([
      { match: pgrstMatch("referral", ["GET"]), handle: () => notFoundSingle() },
    ]);
    vi.stubGlobal("fetch", stub);

    const app = buildApp(env);
    const res = await app.fetch("/api/users/person-1/referral-code");
    expect(res.status).toBe(404);
  });
});

// ============================================
// POST /api/users/:id/referral-code
// ============================================

describe("POST /api/users/:id/referral-code", () => {
  it("409s when the user already has a code", async () => {
    const env = createMockEnv();
    const { stub } = makeFetchStub([
      {
        match: pgrstMatch("referral", ["GET"]),
        handle: () => json({ code: "EXISTING1" }),
      },
    ]);
    vi.stubGlobal("fetch", stub);

    const app = buildApp(env);
    const res = await app.fetch("/api/users/person-1/referral-code", {
      method: "POST",
      headers: authHeaders(),
    });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ code: "EXISTING1" });
  });

  it("creates a new code on the happy path", async () => {
    const env = createMockEnv();
    const { stub, calls } = makeFetchStub([
      { match: pgrstMatch("referral", ["GET"]), handle: () => notFoundSingle() },
      { match: pgrstMatch("referral", ["POST"]), handle: () => json([{ id: "new" }], 201) },
    ]);
    vi.stubGlobal("fetch", stub);

    const app = buildApp(env);
    const res = await app.fetch("/api/users/person-1/referral-code", {
      method: "POST",
      headers: authHeaders(),
    });
    expect(res.status).toBe(201);
    const body = await res.json() as { code: string };
    expect(body.code).toMatch(/^[A-Z0-9]+$/);

    const post = calls.find(c => c.method === "POST");
    expect(post!.body).toMatchObject({
      referrer_person_id: "person-1",
      target_entity_id: "person-1",
      status: "pending",
    });
  });
});

// ============================================
// GET /api/users/:id/reputation
// ============================================

describe("GET /api/users/:id/reputation", () => {
  it("404s when the user does not exist", async () => {
    const env = createMockEnv();
    const { stub } = makeFetchStub([
      { match: pgrstMatch("person", ["GET"]), handle: () => notFoundSingle() },
    ]);
    vi.stubGlobal("fetch", stub);

    const app = buildApp(env);
    const res = await app.fetch("/api/users/ghost/reputation");
    expect(res.status).toBe(404);
  });

  it("derives Trusted Host badge for 10+ events with rating >= 4.5", async () => {
    const env = createMockEnv();
    const events = Array.from({ length: 12 }, (_, i) => ({ id: `e${i}`, attendee_count: 30 }));
    let eventQueryCount = 0;
    const { stub } = makeFetchStub([
      {
        match: pgrstMatch("person", ["GET"]),
        handle: () => json({ id: "host", name: "Chido Mukoko", alternatename: "chido" }),
      },
      {
        match: pgrstMatch("event", ["GET"]),
        handle: ({ url }) => {
          eventQueryCount++;
          if (url.searchParams.get("select") === "attendee_count") return json(events);
          return json(events.map(e => ({ id: e.id })));
        },
      },
      {
        match: pgrstMatch("review", ["GET"]),
        handle: () => json(Array.from({ length: 20 }, () => ({ rating_value: 5 }))),
      },
    ]);
    vi.stubGlobal("fetch", stub);

    const app = buildApp(env);
    const res = await app.fetch("/api/users/host/reputation");
    expect(res.status).toBe(200);
    const body = await res.json() as { host: { badges: string[]; rating: number; eventsHosted: number } };
    expect(body.host.eventsHosted).toBe(12);
    expect(body.host.rating).toBe(5);
    expect(body.host.badges).toContain("Trusted Host");
    expect(eventQueryCount).toBe(2);
  });

  it("returns no badges and zero stats for a new host", async () => {
    const env = createMockEnv();
    const { stub } = makeFetchStub([
      {
        match: pgrstMatch("person", ["GET"]),
        handle: () => json({ id: "host", name: "New Host", alternatename: null }),
      },
      { match: pgrstMatch("event", ["GET"]), handle: () => json([]) },
    ]);
    vi.stubGlobal("fetch", stub);

    const app = buildApp(env);
    const res = await app.fetch("/api/users/host/reputation");
    const body = await res.json() as { host: { badges: string[]; eventsHosted: number } };
    expect(body.host.eventsHosted).toBe(0);
    expect(body.host.badges).toEqual([]);
  });
});

// ============================================
// DELETE /api/users/:id (soft delete + PII anonymisation)
// ============================================

describe("DELETE /api/users/:id", () => {
  it("401s when there is no JWT", async () => {
    const env = createMockEnv();
    const { stub } = makeFetchStub([]);
    vi.stubGlobal("fetch", stub);
    mockedGetAuthenticatedUser.mockResolvedValue({ user: null, failureReason: "no_token" });

    const app = buildApp(env);
    const res = await app.fetch("/api/users/ghost", {
      method: "DELETE",
      headers: authHeaders(),
    });
    expect(res.status).toBe(401);
  });

  it("403s when requester is not self and not admin", async () => {
    const env = createMockEnv();
    const { stub } = makeFetchStub([
      // requester person lookup (in resolvePersonId)
      { match: pgrstMatch("person", ["GET"]), handle: () => json({ id: "person-other" }) },
    ]);
    vi.stubGlobal("fetch", stub);
    mockedGetAuthenticatedUser.mockResolvedValue({ user: { userId: "workos|other" } });

    const app = buildApp(env);
    const res = await app.fetch("/api/users/person-1", {
      method: "DELETE",
      headers: authedOriginHeaders(),
    });
    expect(res.status).toBe(403);
  });

  it("404s when the user does not exist", async () => {
    const env = createMockEnv();
    // First person GET satisfies resolvePersonId, second returns 404 for the
    // soft-delete target.
    let firstCall = true;
    const { stub } = makeFetchStub([
      {
        match: pgrstMatch("person", ["GET"]),
        handle: () => {
          if (firstCall) {
            firstCall = false;
            return json({ id: "ghost" });
          }
          return notFoundSingle();
        },
      },
    ]);
    vi.stubGlobal("fetch", stub);
    mockedGetAuthenticatedUser.mockResolvedValue({ user: { userId: "workos|ghost" } });

    const app = buildApp(env);
    const res = await app.fetch("/api/users/ghost", {
      method: "DELETE",
      headers: authedOriginHeaders(),
    });
    expect(res.status).toBe(404);
  });

  it("404s when the user is already soft-deleted", async () => {
    const env = createMockEnv();
    let firstCall = true;
    const { stub } = makeFetchStub([
      {
        match: pgrstMatch("person", ["GET"]),
        handle: () => {
          if (firstCall) {
            firstCall = false;
            return json({ id: "person-1" });
          }
          return json({ id: "person-1", email: "x@y.z", deleted_at: "2026-05-10T00:00:00Z" });
        },
      },
    ]);
    vi.stubGlobal("fetch", stub);
    mockedGetAuthenticatedUser.mockResolvedValue({ user: { userId: "workos|p1" } });

    const app = buildApp(env);
    const res = await app.fetch("/api/users/person-1", {
      method: "DELETE",
      headers: authedOriginHeaders(),
    });
    expect(res.status).toBe(404);
  });

  it("anonymises PII, cancels RSVPs, and writes an audit row", async () => {
    const env = createMockEnv();
    let personCall = 0;
    const { stub, calls } = makeFetchStub([
      {
        match: pgrstMatch("person", ["GET"]),
        handle: () => {
          personCall += 1;
          // 1st: resolvePersonId for the requester (matches path → self-delete)
          if (personCall === 1) return json({ id: "person-1" });
          // 2nd: load the target user row for the actual delete handler
          return json({ id: "person-1", email: "real@user.com", deleted_at: null });
        },
      },
      { match: pgrstMatch("person", ["PATCH"]), handle: () => noContent() },
      { match: pgrstMatch("rsvp_action", ["PATCH"]), handle: () => noContent() },
      // system.activity_logs — logAudit posts here
      { match: pgrstMatch("activity_logs", ["POST"]), handle: () => json([{ id: "log-1" }], 201) },
    ]);
    vi.stubGlobal("fetch", stub);
    mockedGetAuthenticatedUser.mockResolvedValue({ user: { userId: "workos|p1" } });

    const app = buildApp(env);
    const res = await app.fetch("/api/users/person-1", {
      method: "DELETE",
      headers: authedOriginHeaders(),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ message: "User account deleted successfully" });

    const patch = calls.find(c => c.method === "PATCH" && c.url.includes("/person"));
    expect(patch!.body).toMatchObject({
      name: "Deleted User",
      alternatename: null,
    });
    expect((patch!.body as { deleted_at: string }).deleted_at).toBeTruthy();
    const patchBody = patch!.body as { email: string };
    expect(patchBody.email).toMatch(/^deleted_[a-f0-9]{16}@deleted\.nhimbe\.com$/);

    const rsvpPatch = calls.find(c => c.method === "PATCH" && c.url.includes("/rsvp_action"));
    expect(rsvpPatch!.body).toMatchObject({ rsvpresponse: "https://schema.org/RsvpResponseNo" });

    const audit = calls.find(c => c.method === "POST" && c.url.includes("/activity_logs"));
    expect(audit!.body).toMatchObject({
      action: "user.deleted",
      entity_type: "user",
      entity_id: "person-1",
    });
  });

  it("swallows audit-log failures (delete still succeeds)", async () => {
    const env = createMockEnv();
    let personCall = 0;
    const { stub } = makeFetchStub([
      {
        match: pgrstMatch("person", ["GET"]),
        handle: () => {
          personCall += 1;
          if (personCall === 1) return json({ id: "person-1" });
          return json({ id: "person-1", email: "real@user.com", deleted_at: null });
        },
      },
      { match: pgrstMatch("person", ["PATCH"]), handle: () => noContent() },
      { match: pgrstMatch("rsvp_action", ["PATCH"]), handle: () => noContent() },
      { match: pgrstMatch("activity_logs", ["POST"]), handle: () => json({ error: "db down" }, 500) },
    ]);
    vi.stubGlobal("fetch", stub);
    mockedGetAuthenticatedUser.mockResolvedValue({ user: { userId: "workos|p1" } });

    const app = buildApp(env);
    const res = await app.fetch("/api/users/person-1", {
      method: "DELETE",
      headers: authedOriginHeaders(),
    });
    expect(res.status).toBe(200);
  });
});
