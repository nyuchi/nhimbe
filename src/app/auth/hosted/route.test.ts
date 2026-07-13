import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

// Mock the AuthKit SDK URL builders. Both return a canned hosted URL so no
// network / WorkOS calls run. vi.hoisted keeps them available to the factory.
const { getSignInUrl, getSignUpUrl } = vi.hoisted(() => ({
  getSignInUrl: vi.fn(),
  getSignUpUrl: vi.fn(),
}));

vi.mock("@workos-inc/authkit-nextjs", () => ({
  getSignInUrl,
  getSignUpUrl,
}));

import { GET } from "./route";

function makeRequest(url: string): NextRequest {
  return { nextUrl: new URL(url) } as unknown as NextRequest;
}

describe("GET /auth/hosted", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSignInUrl.mockResolvedValue("https://auth.workos.com/sign-in?client_id=abc");
    getSignUpUrl.mockResolvedValue("https://auth.workos.com/sign-up?client_id=abc");
  });

  it("redirects to the hosted sign-in URL with a clamped returnTo", async () => {
    const res = await GET(makeRequest("https://nhimbe.com/auth/hosted?return_to=/events/123"));

    expect(getSignInUrl).toHaveBeenCalledWith({ returnTo: "/events/123" });
    expect(getSignUpUrl).not.toHaveBeenCalled();
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("https://auth.workos.com/sign-in?client_id=abc");
  });

  it("routes to the hosted sign-up URL when screen=sign-up", async () => {
    const res = await GET(
      makeRequest("https://nhimbe.com/auth/hosted?screen=sign-up&return_to=/profile"),
    );

    expect(getSignUpUrl).toHaveBeenCalledWith({ returnTo: "/profile" });
    expect(getSignInUrl).not.toHaveBeenCalled();
    expect(res.headers.get("location")).toBe("https://auth.workos.com/sign-up?client_id=abc");
  });

  it("clamps an open-redirect return_to back to /", async () => {
    await GET(makeRequest("https://nhimbe.com/auth/hosted?return_to=//evil.example"));
    expect(getSignInUrl).toHaveBeenCalledWith({ returnTo: "/" });
  });

  it("defaults returnTo to / when absent", async () => {
    await GET(makeRequest("https://nhimbe.com/auth/hosted"));
    expect(getSignInUrl).toHaveBeenCalledWith({ returnTo: "/" });
  });

  it("returns 503 when the WorkOS config is missing", async () => {
    getSignInUrl.mockRejectedValueOnce(new Error("no config"));
    const res = await GET(makeRequest("https://nhimbe.com/auth/hosted"));
    expect(res.status).toBe(503);
  });
});
