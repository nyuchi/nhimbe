/**
 * Tests for /api/reviews. After the counter-column race-condition fix, the
 * helpful-vote endpoint delegates to engagement.increment_review_helpful_count
 * (SECURITY DEFINER, atomic) instead of read-then-write through PostgREST.
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
  trustedOriginHeaders as authHeaders,
} from "./mocks";

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
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("POST /api/reviews/:id/helpful", () => {
  it("rejects unauthenticated POST", async () => {
    const env = createMockEnv();
    const app = buildApp(env);
    const res = await app.fetch("/api/reviews/r1/helpful", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: "u1" }),
    });
    expect(res.status).toBe(401);
  });

  it("400s when userId is missing", async () => {
    const env = createMockEnv();
    const app = buildApp(env);
    const res = await app.fetch("/api/reviews/r1/helpful", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  it("404s when the RPC matches no rows (review missing)", async () => {
    const env = createMockEnv();
    const { stub } = makeFetchStub([
      { match: pgrstMatch("rpc/increment_review_helpful_count", ["POST"]), handle: () => json(null) },
    ]);
    vi.stubGlobal("fetch", stub);

    const app = buildApp(env);
    const res = await app.fetch("/api/reviews/missing/helpful", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ userId: "u1" }),
    });
    expect(res.status).toBe(404);
  });

  it("calls the atomic RPC with the review id and returns 200 on success", async () => {
    const env = createMockEnv();
    const { stub, calls } = makeFetchStub([
      { match: pgrstMatch("rpc/increment_review_helpful_count", ["POST"]), handle: () => json(7) },
    ]);
    vi.stubGlobal("fetch", stub);

    const app = buildApp(env);
    const res = await app.fetch("/api/reviews/r1/helpful", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ userId: "u1" }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ message: "Vote recorded" });
    const rpc = calls[0];
    expect(rpc.body).toEqual({ p_review_id: "r1" });
  });
});
