import { describe, expect, it } from "vitest";
import { safeReturnTo } from "./return-to";

describe("safeReturnTo", () => {
  it("passes through plain absolute local paths", () => {
    expect(safeReturnTo("/events/123")).toBe("/events/123");
    expect(safeReturnTo("/")).toBe("/");
    expect(safeReturnTo("/admin?tab=events")).toBe("/admin?tab=events");
  });

  it("falls back to / for anything that could be an open redirect", () => {
    expect(safeReturnTo(null)).toBe("/");
    expect(safeReturnTo(undefined)).toBe("/");
    expect(safeReturnTo("")).toBe("/");
    expect(safeReturnTo("//evil.example")).toBe("/");
    expect(safeReturnTo("/\\evil.example")).toBe("/");
    expect(safeReturnTo("https://evil.example")).toBe("/");
    expect(safeReturnTo("relative/path")).toBe("/");
  });
});
