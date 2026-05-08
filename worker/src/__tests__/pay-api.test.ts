/**
 * Tests for the pay-api edge-function client. Verifies that the worker
 * sends the right auth headers and propagates errors correctly. We do
 * NOT hit the real Edge Function — fetch is stubbed.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { payApiFetch, PayApiConfigError } from "../payments/pay_api";
import { createMockEnv } from "./mocks";

beforeEach(() => {
  vi.unstubAllGlobals();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("payApiFetch", () => {
  it("throws PayApiConfigError when env is missing", async () => {
    const env = createMockEnv({ PAY_API_KEY: undefined });
    await expect(payApiFetch(env, { path: "/v1/health" })).rejects.toBeInstanceOf(
      PayApiConfigError,
    );
  });

  it("sends Authorization Bearer + publishable-key headers", async () => {
    const env = createMockEnv();
    const seen: { url?: string; init?: RequestInit } = {};
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string, init: RequestInit) => {
        seen.url = url;
        seen.init = init;
        return Promise.resolve(
          new Response(JSON.stringify({ ok: true }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        );
      }),
    );

    const result = await payApiFetch<{ ok: boolean }>(env, { path: "/v1/health" });
    expect(result.ok).toBe(true);
    expect(seen.url).toBe(
      "https://test-pay-project.supabase.co/functions/v1/payments-api/v1/health",
    );
    const headers = new Headers(seen.init?.headers as HeadersInit);
    expect(headers.get("Authorization")).toBe("Bearer test-pay-api-key");
    expect(headers.get("x-supabase-pay-publishable-key")).toBe("sb_publishable_test");
  });

  it("propagates non-2xx responses as errors", async () => {
    const env = createMockEnv();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 }),
      ),
    );
    await expect(payApiFetch(env, { path: "/v1/health" })).rejects.toThrow(/401/);
  });
});
