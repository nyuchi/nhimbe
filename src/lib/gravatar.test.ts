import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createHash } from "node:crypto";

vi.mock("server-only", () => ({}));

import { gravatarHash, gravatarUrl, findGravatarUrl } from "./gravatar";

describe("gravatarHash", () => {
  it("trims and lowercases before hashing (Gravatar's documented algorithm)", () => {
    const expected = createHash("sha256").update("someone@example.com").digest("hex");
    expect(gravatarHash("  Someone@Example.com  ")).toBe(expected);
    expect(gravatarHash("someone@example.com")).toBe(expected);
  });
});

describe("gravatarUrl", () => {
  it("builds a sized URL that 404s instead of falling back to a placeholder", () => {
    const url = gravatarUrl("abc123", 128);
    expect(url).toBe("https://www.gravatar.com/avatar/abc123?s=128&d=404");
  });
});

describe("findGravatarUrl", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = vi.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("returns the URL when Gravatar responds ok", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true });
    const url = await findGravatarUrl("someone@example.com");
    expect(url).toContain(gravatarHash("someone@example.com"));
  });

  it("returns null on a 404 (no Gravatar set)", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false });
    const url = await findGravatarUrl("someone@example.com");
    expect(url).toBeNull();
  });

  it("returns null instead of throwing on a network failure", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("network down"));
    const url = await findGravatarUrl("someone@example.com");
    expect(url).toBeNull();
  });
});
