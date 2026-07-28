import { describe, it, expect, vi } from "vitest";

// search.ts is `server-only`; stub the guard so it imports under vitest.
vi.mock("server-only", () => ({}));

import { reciprocalRankFuse } from "./search";

/**
 * Reciprocal Rank Fusion is the core of the app-side hybrid ranking (used until
 * the cluster reaches MongoDB 8.1 for native $rankFusion). These lock the
 * scoring so a refactor can't silently change result ordering.
 */
describe("reciprocalRankFuse", () => {
  it("rewards items ranked highly across BOTH lists over a #1-in-one-only", () => {
    const vector = ["a", "b", "c"];
    const text = ["b", "a", "d"];
    // 'b' is #2+#1, 'a' is #1+#2 — both beat single-list 'c'/'d'.
    const fused = reciprocalRankFuse([vector, text], [1, 1]);
    expect(fused.slice(0, 2).sort()).toEqual(["a", "b"]);
    expect(fused).toContain("c");
    expect(fused).toContain("d");
  });

  it("uses the 1-based RRF-60 formula", () => {
    // Single list: score(rank0) = 1/(60+1), score(rank1) = 1/(60+2) → order kept.
    expect(reciprocalRankFuse([["x", "y", "z"]], [1])).toEqual(["x", "y", "z"]);
  });

  it("weights bias the blend toward the heavier list", () => {
    const a = ["a"]; // rank0 in list A
    const b = ["b"]; // rank0 in list B
    // Heavier weight on A → 'a' first.
    expect(reciprocalRankFuse([a, b], [10, 1])[0]).toBe("a");
    expect(reciprocalRankFuse([a, b], [1, 10])[0]).toBe("b");
  });

  it("dedupes ids that appear in multiple lists", () => {
    const fused = reciprocalRankFuse([["a", "b"], ["a", "b"]], [1, 1]);
    expect(fused).toEqual(["a", "b"]);
    expect(new Set(fused).size).toBe(fused.length);
  });

  it("returns an empty list when there are no inputs", () => {
    expect(reciprocalRankFuse([], [])).toEqual([]);
    expect(reciprocalRankFuse([[]], [1])).toEqual([]);
  });
});
