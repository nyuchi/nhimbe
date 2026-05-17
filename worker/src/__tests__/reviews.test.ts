/**
 * Tests for /api/reviews. After the counter-column race-condition fix, the
 * helpful-vote endpoint delegates to engagement.increment_review_helpful_count
 * (SECURITY DEFINER, atomic) instead of read-then-write through PostgREST.
 *
 * Identity is derived from the WorkOS JWT, so the helpful-vote handler now
 * calls `requireRequesterPersonId` and the test stubs `getAuthenticatedUser`
 * + a `person` GET to satisfy that lookup.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Hono } from "hono";
import type { Env } from "../types";
import { reviews } from "../routes/reviews";
import {
  createMockEnv,
  makeFetchStub,
  pgrstMatch,
  jsonResponse as json,
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
  app.route("/api/reviews", reviews);
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

describe("POST /api/reviews/:id/helpful", () => {
  it("rejects unauthenticated POST (no origin, no api key)", async () => {
    const env = createMockEnv();
    const app = buildApp(env);
    const res = await app.fetch("/api/reviews/r1/helpful", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(401);
  });

  it("401s when no JWT is present", async () => {
    const env = createMockEnv();
    const app = buildApp(env);
    mockedGetAuthenticatedUser.mockResolvedValue({ user: null, failureReason: "no_token" });

    const res = await app.fetch("/api/reviews/r1/helpful", {
      method: "POST",
      headers: originOnlyHeaders(),
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(401);
  });

  it("404s when the RPC matches no rows (review missing)", async () => {
    const env = createMockEnv();
    const { stub } = makeFetchStub([
      { match: pgrstMatch("person", ["GET"]), handle: () => json({ id: "person-1" }) },
      { match: pgrstMatch("rpc/increment_review_helpful_count", ["POST"]), handle: () => json(null) },
    ]);
    vi.stubGlobal("fetch", stub);
    mockedGetAuthenticatedUser.mockResolvedValue({ user: { userId: "workos|p1" } });

    const app = buildApp(env);
    const res = await app.fetch("/api/reviews/missing/helpful", {
      method: "POST",
      headers: authedOriginHeaders(),
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(404);
  });

  it("calls the atomic RPC with the review id and returns 200 on success", async () => {
    const env = createMockEnv();
    const { stub, calls } = makeFetchStub([
      { match: pgrstMatch("person", ["GET"]), handle: () => json({ id: "person-1" }) },
      { match: pgrstMatch("rpc/increment_review_helpful_count", ["POST"]), handle: () => json(7) },
    ]);
    vi.stubGlobal("fetch", stub);
    mockedGetAuthenticatedUser.mockResolvedValue({ user: { userId: "workos|p1" } });

    const app = buildApp(env);
    const res = await app.fetch("/api/reviews/r1/helpful", {
      method: "POST",
      headers: authedOriginHeaders(),
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ message: "Vote recorded" });
    const rpc = calls.find((c) => c.url.includes("rpc/increment_review_helpful_count"));
    expect(rpc!.body).toEqual({ p_review_id: "r1" });
  });
});
