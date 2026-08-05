import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { getMukokoPlan, isMukokoPro } from "./entitlements";

describe("getMukokoPlan", () => {
  it("defaults to free when mukoko is unset", () => {
    expect(getMukokoPlan({})).toBe("free");
  });

  it("defaults to free for an unknown/garbage plan value", () => {
    // @ts-expect-error — exercising untrusted/unexpected data
    expect(getMukokoPlan({ mukoko: { plan: "enterprise" } })).toBe("free");
  });

  it("reads pro and custom through", () => {
    expect(getMukokoPlan({ mukoko: { plan: "pro" } })).toBe("pro");
    expect(getMukokoPlan({ mukoko: { plan: "custom" } })).toBe("custom");
  });
});

describe("isMukokoPro", () => {
  it("is false on the free tier", () => {
    expect(isMukokoPro({})).toBe(false);
    expect(isMukokoPro({ mukoko: { plan: "free" } })).toBe(false);
  });

  it("is true for pro and custom alike", () => {
    expect(isMukokoPro({ mukoko: { plan: "pro" } })).toBe(true);
    expect(isMukokoPro({ mukoko: { plan: "custom" } })).toBe(true);
  });
});
