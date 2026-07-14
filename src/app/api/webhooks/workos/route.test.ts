import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("server-only", () => ({}));

// Mock the WorkOS SDK entry point: constructEvent is the signature gate — the
// tests drive it to resolve (valid signature) or reject (tampered payload).
const { constructEvent } = vi.hoisted(() => ({ constructEvent: vi.fn() }));
vi.mock("@workos-inc/authkit-nextjs", () => ({
  getWorkOS: () => ({ webhooks: { constructEvent } }),
}));

// Mock the Mongo mirrors — the route's job is verify + dispatch; the document
// shapes are covered by users.test.ts / entities.test.ts.
const users = vi.hoisted(() => ({
  syncPersonFromWorkos: vi.fn(),
  deactivatePersonByWorkosId: vi.fn(),
}));
vi.mock("@/lib/mongo/users", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/mongo/users")>();
  return {
    ...actual,
    syncPersonFromWorkos: users.syncPersonFromWorkos,
    deactivatePersonByWorkosId: users.deactivatePersonByWorkosId,
  };
});

const entityMirror = vi.hoisted(() => ({
  mirrorWorkosOrganizationMembership: vi.fn(),
  endWorkosOrganizationMembership: vi.fn(),
}));
vi.mock("@/lib/mongo/entities", () => entityMirror);

// users.ts (via importOriginal) pulls databases → the Mongo client; stub it.
vi.mock("@/lib/mongo/databases", () => ({ personsCollection: vi.fn() }));

import { POST } from "./route";

const WEBHOOK_URL = "https://nhimbe.com/api/webhooks/workos";

function makeRequest(body: unknown, signature: string | null = "t=1,v1=abc"): Request {
  const headers = new Headers({ "content-type": "application/json" });
  if (signature) headers.set("workos-signature", signature);
  return new Request(WEBHOOK_URL, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

const workosUser = {
  object: "user",
  id: "user_123",
  email: "amai@example.com",
  emailVerified: true,
  profilePictureUrl: null,
  name: "Amai Mukoko",
  firstName: "Amai",
  lastName: "Mukoko",
};

const orgMembership = {
  object: "organization_membership",
  id: "om_123",
  organizationId: "org_456",
  organizationName: "Harare Makers Collective",
  userId: "user_123",
  status: "active",
  role: { slug: "admin" },
};

function stubEvent(eventType: string, data: unknown) {
  constructEvent.mockResolvedValue({ id: "event_1", event: eventType, data, createdAt: "2026-07-14T00:00:00Z" });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("WORKOS_WEBHOOK_SECRET", "whsec_test_secret");
  users.syncPersonFromWorkos.mockResolvedValue({ id: "person-1" });
  users.deactivatePersonByWorkosId.mockResolvedValue(true);
  entityMirror.mirrorWorkosOrganizationMembership.mockResolvedValue(undefined);
  entityMirror.endWorkosOrganizationMembership.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("POST /api/webhooks/workos — verification gate", () => {
  it("answers 503 when WORKOS_WEBHOOK_SECRET is unset", async () => {
    vi.stubEnv("WORKOS_WEBHOOK_SECRET", "");
    const res = await POST(makeRequest({ event: "user.created" }));
    expect(res.status).toBe(503);
    expect(constructEvent).not.toHaveBeenCalled();
  });

  it("answers 401 when the signature header is missing", async () => {
    const res = await POST(makeRequest({ event: "user.created" }, null));
    expect(res.status).toBe(401);
    expect(constructEvent).not.toHaveBeenCalled();
    expect(users.syncPersonFromWorkos).not.toHaveBeenCalled();
  });

  it("answers 401 when signature verification fails", async () => {
    constructEvent.mockRejectedValue(new Error("Signature hash does not match"));
    const res = await POST(makeRequest({ event: "user.created", data: workosUser }));
    expect(res.status).toBe(401);
    expect(users.syncPersonFromWorkos).not.toHaveBeenCalled();
  });

  it("verifies over the raw body with the header and secret", async () => {
    stubEvent("user.created", workosUser);
    const body = { event: "user.created", data: workosUser };
    await POST(makeRequest(body, "t=99,v1=sig"));
    expect(constructEvent).toHaveBeenCalledWith({
      payload: JSON.stringify(body),
      sigHeader: "t=99,v1=sig",
      secret: "whsec_test_secret",
    });
  });
});

describe("POST /api/webhooks/workos — user events", () => {
  it.each(["user.created", "user.updated"])("%s upserts identity.persons", async (eventType) => {
    stubEvent(eventType, workosUser);
    const res = await POST(makeRequest({}));

    expect(res.status).toBe(200);
    expect(users.syncPersonFromWorkos).toHaveBeenCalledTimes(1);
    expect(users.syncPersonFromWorkos).toHaveBeenCalledWith({
      workosUserId: "user_123",
      email: "amai@example.com",
      name: "Amai Mukoko",
      givenName: "Amai",
      familyName: "Mukoko",
      picture: null,
      emailVerified: true,
    });
  });

  it("user.deleted soft-deactivates the person", async () => {
    stubEvent("user.deleted", workosUser);
    const res = await POST(makeRequest({}));

    expect(res.status).toBe(200);
    expect(users.deactivatePersonByWorkosId).toHaveBeenCalledWith("user_123");
    expect(users.syncPersonFromWorkos).not.toHaveBeenCalled();
  });

  it("user.deleted for an unseen person still answers 200", async () => {
    users.deactivatePersonByWorkosId.mockResolvedValue(false);
    stubEvent("user.deleted", workosUser);
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(200);
  });
});

describe("POST /api/webhooks/workos — organization membership events", () => {
  it.each(["organization_membership.created", "organization_membership.updated"])(
    "%s mirrors onto entity.memberships",
    async (eventType) => {
      stubEvent(eventType, orgMembership);
      const res = await POST(makeRequest({}));

      expect(res.status).toBe(200);
      expect(entityMirror.mirrorWorkosOrganizationMembership).toHaveBeenCalledWith({
        workosOrganizationMembershipId: "om_123",
        workosOrganizationId: "org_456",
        organizationName: "Harare Makers Collective",
        workosUserId: "user_123",
        roleSlug: "admin",
        status: "active",
      });
    },
  );

  it("organization_membership.deleted ends the mirrored membership", async () => {
    stubEvent("organization_membership.deleted", orgMembership);
    const res = await POST(makeRequest({}));

    expect(res.status).toBe(200);
    expect(entityMirror.endWorkosOrganizationMembership).toHaveBeenCalledWith({
      workosOrganizationMembershipId: "om_123",
    });
    expect(entityMirror.mirrorWorkosOrganizationMembership).not.toHaveBeenCalled();
  });

  it("replayed deliveries are re-dispatched (idempotency lives in the keyed upserts)", async () => {
    stubEvent("organization_membership.created", orgMembership);
    const first = await POST(makeRequest({}));
    const second = await POST(makeRequest({}));

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(entityMirror.mirrorWorkosOrganizationMembership).toHaveBeenCalledTimes(2);
    const [a, b] = entityMirror.mirrorWorkosOrganizationMembership.mock.calls;
    expect(a).toEqual(b);
  });
});

describe("POST /api/webhooks/workos — dispatch outcomes", () => {
  it("answers 200 for unhandled event types without touching Mongo", async () => {
    stubEvent("session.created", { id: "session_1" });
    const res = await POST(makeRequest({}));

    expect(res.status).toBe(200);
    expect(users.syncPersonFromWorkos).not.toHaveBeenCalled();
    expect(users.deactivatePersonByWorkosId).not.toHaveBeenCalled();
    expect(entityMirror.mirrorWorkosOrganizationMembership).not.toHaveBeenCalled();
    expect(entityMirror.endWorkosOrganizationMembership).not.toHaveBeenCalled();
  });

  it("answers 500 when a mirror write fails, so WorkOS retries", async () => {
    users.syncPersonFromWorkos.mockRejectedValue(new Error("cluster unavailable"));
    stubEvent("user.created", workosUser);
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(500);
  });
});
