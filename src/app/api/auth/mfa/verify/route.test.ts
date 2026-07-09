import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

// Mock the AuthKit SDK: authenticateWithTotp completes the step-up and
// saveSession writes the cookie. Both are stubbed so no network/WorkOS calls run.
// vi.hoisted keeps the mock fns available to the hoisted vi.mock factory.
const { authenticateWithTotp, saveSession } = vi.hoisted(() => ({
  authenticateWithTotp: vi.fn(),
  saveSession: vi.fn(),
}));

vi.mock("@workos-inc/authkit-nextjs", () => ({
  getWorkOS: () => ({ userManagement: { authenticateWithTotp } }),
  saveSession,
}));

import { POST } from "./route";

function makeRequest(body: unknown): NextRequest {
  return { json: async () => body } as unknown as NextRequest;
}

describe("POST /api/auth/mfa/verify", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.WORKOS_CLIENT_ID = "client_test";
  });

  it("verifies the TOTP code, saves the session, and returns { ok: true }", async () => {
    authenticateWithTotp.mockResolvedValueOnce({ user: { id: "user_1" } });

    const res = await POST(
      makeRequest({
        code: "123456",
        pendingAuthenticationToken: "pat_abc",
        challengeId: "auth_challenge_1",
      }),
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });
    expect(authenticateWithTotp).toHaveBeenCalledWith(
      expect.objectContaining({
        clientId: "client_test",
        code: "123456",
        pendingAuthenticationToken: "pat_abc",
        authenticationChallengeId: "auth_challenge_1",
      }),
    );
    expect(saveSession).toHaveBeenCalledTimes(1);
  });

  it("returns 401 with a friendly message when the code is rejected", async () => {
    authenticateWithTotp.mockRejectedValueOnce(new Error("invalid code"));

    const res = await POST(
      makeRequest({
        code: "000000",
        pendingAuthenticationToken: "pat_abc",
        challengeId: "auth_challenge_1",
      }),
    );

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: "That code didn't work. Try again." });
    expect(saveSession).not.toHaveBeenCalled();
  });

  it("returns 400 when the code or pending token is missing", async () => {
    const res = await POST(makeRequest({ code: "", pendingAuthenticationToken: "" }));

    expect(res.status).toBe(400);
    expect(authenticateWithTotp).not.toHaveBeenCalled();
  });
});
