/**
 * Tests for the cascading fallback-chain helpers.
 *
 * These back the "cache → API → default" resilience pattern, so the ordering,
 * null/undefined skipping, error swallowing, and final-throw behavior all
 * matter.
 */

import { describe, it, expect, vi } from "vitest";
import { fallbackChain, fallbackChainSync } from "./fallback-chain";

describe("fallbackChain (async)", () => {
  it("returns the first provider's result and skips later providers", async () => {
    const second = vi.fn(() => "second");
    const result = await fallbackChain(() => "first", second);
    expect(result).toBe("first");
    expect(second).not.toHaveBeenCalled();
  });

  it("awaits promise-returning providers", async () => {
    const result = await fallbackChain(async () => "async-value");
    expect(result).toBe("async-value");
  });

  it("skips providers that resolve null or undefined", async () => {
    const result = await fallbackChain(
      () => null,
      () => undefined,
      () => "third",
    );
    expect(result).toBe("third");
  });

  it("treats falsy-but-defined values as valid results", async () => {
    expect(await fallbackChain(() => 0, () => 1)).toBe(0);
    expect(await fallbackChain(() => "", () => "x")).toBe("");
    expect(await fallbackChain(() => false, () => true)).toBe(false);
  });

  it("swallows a thrown provider and moves to the next", async () => {
    const result = await fallbackChain(
      () => {
        throw new Error("boom");
      },
      () => "recovered",
    );
    expect(result).toBe("recovered");
  });

  it("swallows a rejected async provider and moves to the next", async () => {
    const result = await fallbackChain(
      async () => {
        throw new Error("async boom");
      },
      async () => "recovered",
    );
    expect(result).toBe("recovered");
  });

  it("throws the last error when every provider fails", async () => {
    const last = new Error("last failure");
    await expect(
      fallbackChain(
        () => {
          throw new Error("first failure");
        },
        () => {
          throw last;
        },
      ),
    ).rejects.toBe(last);
  });

  it("throws a generic error when all providers yield null/undefined", async () => {
    await expect(fallbackChain(() => null, () => undefined)).rejects.toThrow(
      "All fallback providers failed",
    );
  });

  it("throws the generic error when called with no providers", async () => {
    await expect(fallbackChain()).rejects.toThrow("All fallback providers failed");
  });
});

describe("fallbackChainSync", () => {
  it("returns the first defined result and skips later providers", () => {
    const second = vi.fn(() => "second");
    expect(fallbackChainSync(() => "first", second)).toBe("first");
    expect(second).not.toHaveBeenCalled();
  });

  it("skips null/undefined and recovers from throws", () => {
    const result = fallbackChainSync(
      () => null as string | null,
      () => {
        throw new Error("boom");
      },
      () => "third",
    );
    expect(result).toBe("third");
  });

  it("throws the last error when every provider fails", () => {
    const last = new Error("last");
    expect(() =>
      fallbackChainSync(
        () => {
          throw new Error("first");
        },
        () => {
          throw last;
        },
      ),
    ).toThrow(last);
  });

  it("throws the generic error when all providers yield nullish", () => {
    expect(() => fallbackChainSync(() => null, () => undefined)).toThrow(
      "All fallback providers failed",
    );
  });
});
