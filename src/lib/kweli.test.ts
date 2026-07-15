import { describe, it, expect } from "vitest";
import { kweliVerifyUrl, verificationTierCode, verificationTierLevel } from "./kweli";

describe("verificationTierLevel", () => {
  it("passes through valid numeric tiers", () => {
    expect(verificationTierLevel(0)).toBe(0);
    expect(verificationTierLevel(1)).toBe(1);
    expect(verificationTierLevel(4)).toBe(4);
  });

  it("coerces numeric strings", () => {
    expect(verificationTierLevel("2")).toBe(2);
    expect(verificationTierLevel("3")).toBe(3);
  });

  it("degrades garbage to 0 (absence, never an error)", () => {
    expect(verificationTierLevel(undefined)).toBe(0);
    expect(verificationTierLevel(null)).toBe(0);
    expect(verificationTierLevel("")).toBe(0);
    expect(verificationTierLevel("gold")).toBe(0);
    expect(verificationTierLevel(Number.NaN)).toBe(0);
    expect(verificationTierLevel({})).toBe(0);
    expect(verificationTierLevel(-1)).toBe(0);
  });

  it("clamps out-of-range and floors fractional values", () => {
    expect(verificationTierLevel(99)).toBe(4);
    expect(verificationTierLevel(2.9)).toBe(2);
  });
});

describe("verificationTierCode", () => {
  it("maps levels onto the nyuchi-verified-badge tier codes", () => {
    expect(verificationTierCode(0)).toBe("unverified");
    expect(verificationTierCode(1)).toBe("community");
    expect(verificationTierCode(2)).toBe("otp");
    expect(verificationTierCode(3)).toBe("government");
    expect(verificationTierCode(4)).toBe("licensed");
  });

  it("handles string tiers and absence", () => {
    expect(verificationTierCode("4")).toBe("licensed");
    expect(verificationTierCode(undefined)).toBe("unverified");
  });
});

describe("kweliVerifyUrl", () => {
  it("prefers the place id", () => {
    expect(kweliVerifyUrl({ placeId: "place-1", entityId: "ent-1" })).toBe(
      "https://kweli.mukoko.com/en/verify?place=place-1&source=nhimbe",
    );
  });

  it("falls back to the entity id", () => {
    expect(kweliVerifyUrl({ entityId: "ent-1" })).toBe(
      "https://kweli.mukoko.com/en/verify?entity=ent-1&source=nhimbe",
    );
  });

  it("returns null when no id is at hand", () => {
    expect(kweliVerifyUrl({})).toBeNull();
    expect(kweliVerifyUrl({ placeId: null, entityId: null })).toBeNull();
  });

  it("URL-encodes ids", () => {
    expect(kweliVerifyUrl({ placeId: "a b&c" })).toBe(
      "https://kweli.mukoko.com/en/verify?place=a%20b%26c&source=nhimbe",
    );
  });
});
