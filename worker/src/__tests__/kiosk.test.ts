/**
 * Tests for /api/kiosk. Covers the pairing-code lifecycle (request → status
 * → confirm) and the post-pairing session validation/revocation paths.
 * WorkOS JWT validation in /pair/:code/confirm is short-circuited via
 * vi.mock('../auth/workos').
 *
 * Coverage:
 *   POST   /pair/request                — code generation, default screenType,
 *                                          custom screenType passthrough
 *   GET    /pair/:code/status           — pending / claimed / expired branches
 *   POST   /pair/:code/confirm          — 400 missing eventId, 404 missing
 *                                          pairing, 409 already-claimed,
 *                                          404 missing event, happy path
 *                                          (writes pairing patch + device +
 *                                          session rows, returns session token)
 *   GET    /session/:token              — 401 on invalid token, valid lookup
 *   DELETE /session/:token              — revokes by token hash
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Hono } from "hono";
import type { Env } from "../types";
import { kiosk } from "../routes/kiosk";
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
  app.route("/api/kiosk", kiosk);
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
// POST /api/kiosk/pair/request
// ============================================

describe("POST /api/kiosk/pair/request", () => {
  it("creates a 6-char code with default screenType=kiosk", async () => {
    const env = createMockEnv();
    const { stub, calls } = makeFetchStub([
      { match: pgrstMatch("pairing", ["POST"]), handle: () => json([{ id: "p1" }], 201) },
    ]);
    vi.stubGlobal("fetch", stub);

    const app = buildApp(env);
    const res = await app.fetch("/api/kiosk/pair/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { code: string; screenType: string; expiresIn: number };
    expect(body.code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
    expect(body.screenType).toBe("kiosk");
    expect(body.expiresIn).toBe(300);

    const post = calls[0];
    expect(post.body).toMatchObject({
      code: body.code,
      intended_device_type: "kiosk",
      status: "pending",
    });
  });

  it("honours custom screenType when it's in the whitelist", async () => {
    const env = createMockEnv();
    const { stub } = makeFetchStub([
      { match: pgrstMatch("pairing", ["POST"]), handle: () => json([{ id: "p1" }], 201) },
    ]);
    vi.stubGlobal("fetch", stub);

    const app = buildApp(env);
    const res = await app.fetch("/api/kiosk/pair/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ screenType: "signage-host" }),
    });
    expect((await res.json() as { screenType: string }).screenType).toBe("signage-host");
  });

  it("falls back to kiosk when screenType is unknown", async () => {
    const env = createMockEnv();
    const { stub } = makeFetchStub([
      { match: pgrstMatch("pairing", ["POST"]), handle: () => json([{ id: "p1" }], 201) },
    ]);
    vi.stubGlobal("fetch", stub);

    const app = buildApp(env);
    const res = await app.fetch("/api/kiosk/pair/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ screenType: "bogus" }),
    });
    expect((await res.json() as { screenType: string }).screenType).toBe("kiosk");
  });
});

// ============================================
// GET /api/kiosk/pair/:code/status
// ============================================

describe("GET /api/kiosk/pair/:code/status", () => {
  it("returns 'expired' when no live pairing matches", async () => {
    const env = createMockEnv();
    const { stub } = makeFetchStub([
      { match: pgrstMatch("pairing", ["GET"]), handle: () => notFoundSingle() },
    ]);
    vi.stubGlobal("fetch", stub);

    const app = buildApp(env);
    const res = await app.fetch("/api/kiosk/pair/ABCD23/status");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "expired" });
  });

  it("returns pending status without resolving event", async () => {
    const env = createMockEnv();
    const PLACEHOLDER = "00000000-0000-0000-0000-000000000000";
    const { stub, calls } = makeFetchStub([
      {
        match: pgrstMatch("pairing", ["GET"]),
        handle: () => json({
          code: "ABCD23",
          status: "pending",
          intended_device_type: "kiosk",
          context_entity_id: PLACEHOLDER,
          initiated_by_person_id: null,
          expires_at: "2099-01-01T00:00:00Z",
        }),
      },
    ]);
    vi.stubGlobal("fetch", stub);

    const app = buildApp(env);
    const res = await app.fetch("/api/kiosk/pair/ABCD23/status");
    expect(await res.json()).toEqual({ status: "pending", screenType: "kiosk" });
    expect(calls).toHaveLength(1); // no event lookup
  });

  it("resolves event details once claimed", async () => {
    const env = createMockEnv();
    const { stub } = makeFetchStub([
      {
        match: pgrstMatch("pairing", ["GET"]),
        handle: () => json({
          code: "ABCD23",
          status: "claimed",
          intended_device_type: "kiosk",
          context_entity_id: "evt-1",
          initiated_by_person_id: "host-1",
          expires_at: "2099-01-01T00:00:00Z",
        }),
      },
      {
        match: pgrstMatch("event", ["GET"]),
        handle: () => json({ id: "evt-1", name: "Tech Summit", organizer: { name: "Chido" } }),
      },
    ]);
    vi.stubGlobal("fetch", stub);

    const app = buildApp(env);
    const res = await app.fetch("/api/kiosk/pair/ABCD23/status");
    expect(await res.json()).toMatchObject({
      status: "claimed",
      eventId: "evt-1",
      eventName: "Tech Summit",
      hostName: "Chido",
    });
  });
});

// ============================================
// POST /api/kiosk/pair/:code/confirm
// ============================================

describe("POST /api/kiosk/pair/:code/confirm", () => {
  it("rejects unauthenticated POST", async () => {
    const env = createMockEnv();
    const app = buildApp(env);
    const res = await app.fetch("/api/kiosk/pair/ABCD23/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventId: "evt-1" }),
    });
    expect(res.status).toBe(401);
  });

  it("400s when eventId is missing", async () => {
    const env = createMockEnv();
    const app = buildApp(env);
    const res = await app.fetch("/api/kiosk/pair/ABCD23/confirm", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  it("404s when pairing code is unknown or expired", async () => {
    const env = createMockEnv();
    const { stub } = makeFetchStub([
      { match: pgrstMatch("pairing", ["GET"]), handle: () => notFoundSingle() },
    ]);
    vi.stubGlobal("fetch", stub);

    const app = buildApp(env);
    const res = await app.fetch("/api/kiosk/pair/ABCD23/confirm", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ eventId: "evt-1" }),
    });
    expect(res.status).toBe(404);
  });

  it("409s when pairing is already claimed", async () => {
    const env = createMockEnv();
    const { stub } = makeFetchStub([
      {
        match: pgrstMatch("pairing", ["GET"]),
        handle: () => json({
          code: "ABCD23",
          status: "claimed",
          intended_device_type: "kiosk",
          context_entity_id: "evt-1",
          initiated_by_person_id: "host",
          expires_at: "2099-01-01T00:00:00Z",
        }),
      },
    ]);
    vi.stubGlobal("fetch", stub);

    const app = buildApp(env);
    const res = await app.fetch("/api/kiosk/pair/ABCD23/confirm", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ eventId: "evt-1" }),
    });
    expect(res.status).toBe(409);
  });

  it("404s when the event does not exist", async () => {
    const env = createMockEnv();
    const { stub } = makeFetchStub([
      {
        match: pgrstMatch("pairing", ["GET"]),
        handle: () => json({
          code: "ABCD23",
          status: "pending",
          intended_device_type: "kiosk",
          context_entity_id: "00000000-0000-0000-0000-000000000000",
          initiated_by_person_id: null,
          expires_at: "2099-01-01T00:00:00Z",
        }),
      },
      { match: pgrstMatch("event", ["GET"]), handle: () => notFoundSingle() },
    ]);
    vi.stubGlobal("fetch", stub);

    const app = buildApp(env);
    const res = await app.fetch("/api/kiosk/pair/ABCD23/confirm", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ eventId: "missing" }),
    });
    expect(res.status).toBe(404);
  });

  it("happy path: claims pairing, creates device + session, returns token", async () => {
    const env = createMockEnv();
    mockedGetAuthenticatedUser.mockResolvedValue({
      user: { userId: "workos|host", email: "host@nyuchi.com" },
    });
    const { stub, calls } = makeFetchStub([
      {
        match: pgrstMatch("pairing", ["GET"]),
        handle: () => json({
          code: "ABCD23",
          status: "pending",
          intended_device_type: "kiosk",
          context_entity_id: "00000000-0000-0000-0000-000000000000",
          initiated_by_person_id: null,
          expires_at: "2099-01-01T00:00:00Z",
        }),
      },
      {
        match: pgrstMatch("event", ["GET"]),
        handle: () => json({ id: "evt-1", name: "Tech Summit", organizer: { name: "Chido" } }),
      },
      { match: pgrstMatch("person", ["GET"]), handle: () => json({ id: "host-uuid" }) },
      { match: pgrstMatch("pairing", ["PATCH"]), handle: () => noContent() },
      { match: pgrstMatch("device", ["POST"]), handle: () => json([{ id: "device-uuid" }], 201) },
      { match: pgrstMatch("session", ["POST"]), handle: () => json([{ id: "session-uuid" }], 201) },
    ]);
    vi.stubGlobal("fetch", stub);

    const app = buildApp(env);
    const res = await app.fetch("/api/kiosk/pair/ABCD23/confirm", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ eventId: "evt-1" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { sessionToken: string; eventName: string };
    expect(body.eventName).toBe("Tech Summit");
    expect(body.sessionToken).toMatch(/^[a-f0-9]{64}$/);

    const pairingPatch = calls.find(c => c.method === "PATCH" && c.url.includes("/pairing"));
    expect(pairingPatch!.body).toMatchObject({
      status: "claimed",
      context_entity_id: "evt-1",
      initiated_by_person_id: "host-uuid",
    });

    const devicePost = calls.find(c => c.method === "POST" && c.url.includes("/device") && !c.url.includes("/session"));
    expect(devicePost!.body).toMatchObject({
      device_type: "kiosk",
      context_entity_id: "evt-1",
      owner_person_id: "host-uuid",
      status: "active",
    });

    const sessionPost = calls.find(c => c.method === "POST" && c.url.includes("/session"));
    expect(sessionPost!.body).toMatchObject({ device_id: "device-uuid" });
    // token_hash should be a 64-char hex SHA-256 of the returned session token.
    const tokenHash = (sessionPost!.body as { token_hash: string }).token_hash;
    expect(tokenHash).toMatch(/^[a-f0-9]{64}$/);
  });
});

// ============================================
// GET /api/kiosk/session/:token
// ============================================

describe("GET /api/kiosk/session/:token", () => {
  it("401s on missing or revoked session", async () => {
    const env = createMockEnv();
    const { stub } = makeFetchStub([
      { match: pgrstMatch("session", ["GET"]), handle: () => notFoundSingle() },
    ]);
    vi.stubGlobal("fetch", stub);

    const app = buildApp(env);
    const res = await app.fetch("/api/kiosk/session/sometoken", { headers: authHeaders() });
    expect(res.status).toBe(401);
  });

  it("401s when the device has no bound event", async () => {
    const env = createMockEnv();
    const { stub } = makeFetchStub([
      {
        match: pgrstMatch("session", ["GET"]),
        handle: () => json({
          device_id: "device-1",
          started_at: "2026-05-01T00:00:00Z",
          expires_at: "2099-01-01T00:00:00Z",
          revoked_at: null,
        }),
      },
      {
        match: pgrstMatch("device", ["GET"]),
        handle: () => json({
          id: "device-1",
          device_type: "kiosk",
          context_entity_id: null,
          owner_person_id: null,
        }),
      },
    ]);
    vi.stubGlobal("fetch", stub);

    const app = buildApp(env);
    const res = await app.fetch("/api/kiosk/session/sometoken", { headers: authHeaders() });
    expect(res.status).toBe(401);
  });

  it("returns the bound event + device shape on valid session", async () => {
    const env = createMockEnv();
    const { stub } = makeFetchStub([
      {
        match: pgrstMatch("session", ["GET"]),
        handle: () => json({
          device_id: "device-1",
          started_at: "2026-05-01T00:00:00Z",
          expires_at: "2099-01-01T00:00:00Z",
          revoked_at: null,
        }),
      },
      {
        match: pgrstMatch("device", ["GET"]),
        handle: () => json({
          id: "device-1",
          device_type: "kiosk",
          context_entity_id: "evt-1",
          owner_person_id: "host-1",
        }),
      },
      {
        match: pgrstMatch("event", ["GET"]),
        handle: () => json({ id: "evt-1", name: "Tech Summit" }),
      },
    ]);
    vi.stubGlobal("fetch", stub);

    const app = buildApp(env);
    const res = await app.fetch("/api/kiosk/session/sometoken", { headers: authHeaders() });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      session: {
        eventId: "evt-1",
        eventName: "Tech Summit",
        screenType: "kiosk",
        hostId: "host-1",
      },
    });
  });
});

// ============================================
// DELETE /api/kiosk/session/:token
// ============================================

describe("DELETE /api/kiosk/session/:token", () => {
  it("patches revoked_at on the session row", async () => {
    const env = createMockEnv();
    const { stub, calls } = makeFetchStub([
      { match: pgrstMatch("session", ["PATCH"]), handle: () => noContent() },
    ]);
    vi.stubGlobal("fetch", stub);

    const app = buildApp(env);
    const res = await app.fetch("/api/kiosk/session/sometoken", {
      method: "DELETE",
      headers: authHeaders(),
    });
    expect(res.status).toBe(200);
    const patch = calls[0];
    expect((patch.body as { revoked_at: string }).revoked_at).toBeTruthy();
  });
});
