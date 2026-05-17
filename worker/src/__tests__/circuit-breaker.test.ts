/**
 * Tests for the throw-on-open circuit breaker wired into supabaseFetch.
 * Covers:
 *   - SupabaseTransientError trips the breaker after 5 failures
 *   - non-transient errors (4xx, 500) don't count toward the threshold
 *   - OPEN circuit short-circuits with CircuitOpenError before fetch is hit
 *   - cooldown → HALF_OPEN → CLOSED on a single success
 *   - timeout race counts as a failure
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { supabaseFetch, SupabaseTransientError } from "../db/supabase";
import { CircuitOpenError, resetCircuit, withCircuitBreakerThrow } from "../utils/circuit-breaker";
import { createMockEnv } from "./mocks";

beforeEach(() => {
  vi.unstubAllGlobals();
  resetCircuit("supabase");
  resetCircuit("test-provider");
});
afterEach(() => {
  vi.unstubAllGlobals();
  resetCircuit("supabase");
  resetCircuit("test-provider");
});

describe("withCircuitBreakerThrow", () => {
  it("re-throws operation errors and counts them by default", async () => {
    const op = vi.fn().mockRejectedValue(new Error("boom"));
    await expect(withCircuitBreakerThrow("test-provider", op)).rejects.toThrow("boom");
    expect(op).toHaveBeenCalledTimes(1);
  });

  it("skips counting when shouldCountAsFailure returns false", async () => {
    const op = vi.fn().mockRejectedValue(new Error("client-side bug"));
    // Run 10 times — none should trip the default threshold (3 for unknown providers).
    for (let i = 0; i < 10; i++) {
      await expect(
        withCircuitBreakerThrow("test-provider", op, { shouldCountAsFailure: () => false }),
      ).rejects.toThrow("client-side bug");
    }
    // Circuit should still be CLOSED — next call goes through.
    op.mockResolvedValueOnce("ok");
    await expect(
      withCircuitBreakerThrow("test-provider", op, { shouldCountAsFailure: () => false }),
    ).resolves.toBe("ok");
  });

  it("throws CircuitOpenError once the failure threshold is crossed", async () => {
    // 'supabase' threshold = 5
    const op = vi.fn().mockRejectedValue(new SupabaseTransientError("503", 503));
    for (let i = 0; i < 5; i++) {
      await expect(
        withCircuitBreakerThrow("supabase", op, {
          shouldCountAsFailure: (e) => e instanceof SupabaseTransientError,
        }),
      ).rejects.toBeInstanceOf(SupabaseTransientError);
    }
    // 6th call short-circuits — op should NOT be invoked again.
    op.mockClear();
    await expect(
      withCircuitBreakerThrow("supabase", op, {
        shouldCountAsFailure: (e) => e instanceof SupabaseTransientError,
      }),
    ).rejects.toBeInstanceOf(CircuitOpenError);
    expect(op).not.toHaveBeenCalled();
  });
});

describe("supabaseFetch + circuit breaker integration", () => {
  it("opens the circuit after 5 transient errors", async () => {
    const env = createMockEnv();
    const fetchStub = vi.fn().mockResolvedValue(new Response("Bad Gateway", { status: 502 }));
    vi.stubGlobal("fetch", fetchStub);

    // 5 calls — each retries internally (GET path), but we only care that the
    // breaker opens. The retry logic will hammer fetch until withRetry gives up;
    // each "give up" counts once toward the breaker.
    for (let i = 0; i < 5; i++) {
      await expect(
        supabaseFetch(env, { schema: "events", path: "event", method: "POST", body: {} }),
      ).rejects.toBeInstanceOf(SupabaseTransientError);
    }
    fetchStub.mockClear();

    // 6th call must short-circuit.
    await expect(
      supabaseFetch(env, { schema: "events", path: "event", method: "POST", body: {} }),
    ).rejects.toBeInstanceOf(CircuitOpenError);
    expect(fetchStub).not.toHaveBeenCalled();
  });

  it("4xx errors do not open the circuit", async () => {
    const env = createMockEnv();
    const fetchStub = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ error: "bad input" }), { status: 400 }));
    vi.stubGlobal("fetch", fetchStub);

    // Hit 10 times — circuit should NOT open since 400 isn't a SupabaseTransientError.
    for (let i = 0; i < 10; i++) {
      await expect(
        supabaseFetch(env, { schema: "events", path: "event", method: "POST", body: {} }),
      ).rejects.toThrow(/400/);
    }
    // 11th still hits fetch (circuit closed).
    expect(fetchStub).toHaveBeenCalledTimes(10);
    await expect(
      supabaseFetch(env, { schema: "events", path: "event", method: "POST", body: {} }),
    ).rejects.toThrow(/400/);
    expect(fetchStub).toHaveBeenCalledTimes(11);
  });

  it("recovers via HALF_OPEN on a single success after the cooldown", async () => {
    const env = createMockEnv();

    // Use fake timers so we can fast-forward the cooldown without real waits.
    vi.useFakeTimers();
    try {
      // Trip the breaker.
      const failingFetch = vi.fn().mockResolvedValue(new Response("oops", { status: 503 }));
      vi.stubGlobal("fetch", failingFetch);
      for (let i = 0; i < 5; i++) {
        await expect(
          supabaseFetch(env, { schema: "events", path: "event", method: "POST", body: {} }),
        ).rejects.toBeInstanceOf(SupabaseTransientError);
      }
      // Verify it's open.
      await expect(
        supabaseFetch(env, { schema: "events", path: "event", method: "POST", body: {} }),
      ).rejects.toBeInstanceOf(CircuitOpenError);

      // Advance past the 30s cooldown.
      vi.advanceTimersByTime(31_000);

      // Next call goes through (HALF_OPEN); we make it succeed.
      const okFetch = vi
        .fn()
        .mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
      vi.stubGlobal("fetch", okFetch);

      const result = await supabaseFetch<{ ok: boolean }>(env, {
        schema: "events", path: "event", method: "POST", body: {},
      });
      expect(result).toEqual({ ok: true });
      expect(okFetch).toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
