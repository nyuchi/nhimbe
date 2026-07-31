import { describe, it, expect } from "vitest";
import { categoryToMineral, NHIMBE_LEAD_MINERAL } from "./category-mineral";

describe("categoryToMineral", () => {
  it("defaults to the nhimbe lead (tanzanite) when uncategorised", () => {
    expect(categoryToMineral()).toBe("tanzanite");
    expect(categoryToMineral(null)).toBe("tanzanite");
    expect(categoryToMineral("")).toBe("tanzanite");
    expect(NHIMBE_LEAD_MINERAL).toBe("tanzanite");
  });

  it("maps arts/culture families to tanzanite (the lead)", () => {
    expect(categoryToMineral("Music")).toBe("tanzanite");
    expect(categoryToMineral("Culture & Heritage")).toBe("tanzanite");
    expect(categoryToMineral("comedy")).toBe("tanzanite");
  });

  it("maps knowledge/tech/business to cobalt", () => {
    expect(categoryToMineral("Technology")).toBe("cobalt");
    expect(categoryToMineral("business")).toBe("cobalt");
    expect(categoryToMineral("Networking & Mixers")).toBe("cobalt");
  });

  it("maps outdoors/sport/health/environment to malachite", () => {
    expect(categoryToMineral("Outdoors & Hiking")).toBe("malachite");
    expect(categoryToMineral("Football")).toBe("malachite");
    expect(categoryToMineral("Health & Medicine")).toBe("malachite");
  });

  it("maps food/faith/agriculture to gold", () => {
    expect(categoryToMineral("Food & Drink")).toBe("gold");
    expect(categoryToMineral("Faith & Spirituality")).toBe("gold");
    expect(categoryToMineral("Agriculture")).toBe("gold");
  });

  it("maps community/family/ubuntu to terracotta", () => {
    expect(categoryToMineral("Community Service")).toBe("terracotta");
    expect(categoryToMineral("Family & Parenting")).toBe("terracotta");
    expect(categoryToMineral("Ubuntu Gatherings")).toBe("terracotta");
  });

  it("falls back to the lead for unknown categories", () => {
    expect(categoryToMineral("Something Unmapped")).toBe("tanzanite");
  });

  // Live engagement.interestCategories rows (the 2026-07 refresh) that
  // previously fell through to the tanzanite default with no keyword hit.
  it("maps the newer engagement.interestCategories rows", () => {
    expect(categoryToMineral("Crypto & Web3")).toBe("cobalt");
    expect(categoryToMineral("Real Estate")).toBe("cobalt");
    expect(categoryToMineral("World News")).toBe("cobalt");
    expect(categoryToMineral("History")).toBe("cobalt");
    expect(categoryToMineral("Housing & Urban Development")).toBe("cobalt");
    expect(categoryToMineral("Travel & Tourism")).toBe("malachite");
    expect(categoryToMineral("African Identity")).toBe("tanzanite");
  });

  it("resolves Automotive & Transport to cobalt, not an accidental 'sport' match", () => {
    expect(categoryToMineral("Automotive & Transport")).toBe("cobalt");
  });
});
