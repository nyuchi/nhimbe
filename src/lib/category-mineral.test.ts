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
});
