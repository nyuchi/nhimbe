import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { isMukokoPro } from "./entitlements";

describe("isMukokoPro", () => {
  it("is false when mukoko is unset", () => {
    expect(isMukokoPro({})).toBe(false);
  });

  it("is false when proPlan is unset or false", () => {
    expect(isMukokoPro({ mukoko: {} })).toBe(false);
    expect(isMukokoPro({ mukoko: { proPlan: false } })).toBe(false);
  });

  it("is true only when proPlan is exactly true", () => {
    expect(isMukokoPro({ mukoko: { proPlan: true } })).toBe(true);
  });
});
