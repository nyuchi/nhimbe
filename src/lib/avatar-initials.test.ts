import { describe, it, expect } from "vitest";
import { getInitials } from "./avatar-initials";

describe("getInitials", () => {
  it("takes the first letter of up to two words, uppercased", () => {
    expect(getInitials("Amara Ncube")).toBe("AN");
  });

  it("defaults to two words even with a longer name", () => {
    expect(getInitials("Amai Chipo Mukoko")).toBe("AC");
  });

  it("respects a custom max", () => {
    expect(getInitials("Amara Ncube", 1)).toBe("A");
  });

  it("handles a single-word name", () => {
    expect(getInitials("Amara")).toBe("A");
  });

  it("collapses irregular whitespace and trims", () => {
    expect(getInitials("  Amara   Ncube  ")).toBe("AN");
  });

  it("returns an empty string for null, undefined, or empty input", () => {
    expect(getInitials(null)).toBe("");
    expect(getInitials(undefined)).toBe("");
    expect(getInitials("")).toBe("");
    expect(getInitials("   ")).toBe("");
  });

  it("lowercases input still uppercases the initials", () => {
    expect(getInitials("amara ncube")).toBe("AN");
  });
});
