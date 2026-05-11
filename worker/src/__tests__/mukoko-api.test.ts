/**
 * Tests for the api.mukoko.com client. Verifies the worker forwards the
 * machine-context API key on every call, conditionally forwards the user's
 * WorkOS access token, and propagates non-2xx responses as errors.
 * fetch is stubbed — the real gateway is never hit.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mukokoApiFetch, MukokoApiConfigError } from "../payments/mukoko_api";
import { createMockEnv } from "./mocks";

beforeEach(() => {
  vi.unstubAllGlobals();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("mukokoApiFetch", () => {
  it("throws MukokoApiConfigError when MUKOKO_API_URL is missing", async () => {
    const env = createMockEnv({ MUKOKO_API_URL: undefined });
    await expect(
      mukokoApiFetch(env, { path: "/v1/health" }),
    ).rejects.toBeInstanceOf(MukokoApiConfigError);
  });

  it("throws MukokoApiConfigError when MUKOKO_API_KEY is missing", async () => {
    const env = createMockEnv({ MUKOKO_API_KEY: undefined });
    await expect(
      mukokoApiFetch(env, { path: "/v1/health" }),
    ).rejects.toBeInstanceOf(MukokoApiConfigError);
  });

  it("always sends X-Api-Key (machine-context, no user token)", async () => {
    const env = createMockEnv();
    const seen: { url?: string; init?: RequestInit } = {};
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string, init: RequestInit) => {
        seen.url = url;
        seen.init = init;
        return Promise.resolve(
          new Response(JSON.stringify({ ok: true }), { status: 200 }),
        );
      }),
    );

    const result = await mukokoApiFetch<{ ok: boolean }>(env, { path: "/v1/health" });
    expect(result.ok).toBe(true);
    expect(seen.url).toBe("https://api.mukoko.test/v1/health");
    const headers = new Headers(seen.init?.headers as HeadersInit);
    expect(headers.get("X-Api-Key")).toBe("test-mukoko-api-key");
    expect(headers.get("Authorization")).toBeNull();
  });

  it("adds Authorization Bearer when userAccessToken is provided", async () => {
    const env = createMockEnv();
    const seen: { init?: RequestInit } = {};
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((_url: string, init: RequestInit) => {
        seen.init = init;
        return Promise.resolve(
          new Response(JSON.stringify({ ok: true }), { status: 200 }),
        );
      }),
    );

    await mukokoApiFetch(env, {
      path: "/v1/payments/intents",
      method: "POST",
      body: { amount: 1000 },
      userAccessToken: "workos.user.token",
    });
    const headers = new Headers(seen.init?.headers as HeadersInit);
    expect(headers.get("X-Api-Key")).toBe("test-mukoko-api-key");
    expect(headers.get("Authorization")).toBe("Bearer workos.user.token");
    expect(seen.init?.method).toBe("POST");
    expect(seen.init?.body).toBe(JSON.stringify({ amount: 1000 }));
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
      mukokoApiFetch(env, { path: "/v1/health" }),
    ).rejects.toThrow(/401/);
  });
});
