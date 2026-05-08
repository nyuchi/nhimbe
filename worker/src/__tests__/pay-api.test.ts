/**
 * Tests for the pay-api edge-function client. Verifies that the worker
 * forwards the user's WorkOS access token correctly and propagates errors.
 * The real Edge Function is never hit — fetch is stubbed.
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
  it("throws PayApiConfigError when SUPABASE_PAY_URL is missing", async () => {
    const env = createMockEnv({ SUPABASE_PAY_URL: undefined });
    await expect(
      payApiFetch(env, { path: "/v1/health", accessToken: "tok" }),
    ).rejects.toBeInstanceOf(PayApiConfigError);
  });

  it("forwards the WorkOS access token as Authorization Bearer", async () => {
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

    const result = await payApiFetch<{ ok: boolean }>(env, {
      path: "/v1/health",
      accessToken: "workos.access.token",
    });
    expect(result.ok).toBe(true);
    expect(seen.url).toBe(
      "https://test-pay-project.supabase.co/functions/v1/payments-intents/v1/health",
    );
    const headers = new Headers(seen.init?.headers as HeadersInit);
    expect(headers.get("Authorization")).toBe("Bearer workos.access.token");
    // No machine-to-machine secret is sent on the user-context path.
    expect(headers.get("x-supabase-pay-publishable-key")).toBeNull();
  });

  it("propagates non-2xx responses as errors", async () => {
    const env = createMockEnv();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 }),
      ),
    );
    await expect(
      payApiFetch(env, { path: "/v1/health", accessToken: "tok" }),
    ).rejects.toThrow(/401/);
  });
});
