/**
 * Tests for /api/payments. Covers payment-intent creation (writes to
 * wallet.payment_intents), Paynow webhook HMAC verification, and status
 * lookup. The Paynow provider's createPayment is currently a stub that
 * returns `success: false` — that's the real production state, so we test
 * the error-path the route actually takes today.
 *
 * Coverage:
 *   POST /create        — missing fields 400, invalid amount 400, invalid
 *                         returnUrl 400, missing rsvp 404, missing org 500,
 *                         provider-not-configured 500, current stub behaviour
 *   POST /webhook       — missing hash, bad HMAC, valid + status mapping
 *                         (paid → completed, cancelled → failed, etc.)
 *   GET  /:id/status    — found, 404 missing, amount conversion to cents
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Hono } from "hono";
import type { Env } from "../types";
import { payments } from "../routes/payments";
import {
  createMockEnv,
  makeFetchStub,
  pgrstMatch,
  jsonResponse as json,
  noContent,
  notFoundSingle,
  trustedOriginHeaders as authHeaders,
} from "./mocks";

function buildApp(env: Env) {
  const app = new Hono<{ Bindings: Env }>();
  app.route("/api/payments", payments);
  return {
    fetch: (path: string, init?: RequestInit) =>
      app.fetch(new Request(`http://localhost${path}`, init), env),
  };
}

beforeEach(() => {
  vi.unstubAllGlobals();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

// ============================================
// POST /api/payments/create
// ============================================

describe("POST /api/payments/create", () => {
  const validBody = {
    registrationId: "rsvp-1",
    eventId: "evt-1",
    amount: 1500,
    currency: "USD",
    returnUrl: "https://nhimbe.com/payments/done",
  };

  it("rejects unauthenticated POST", async () => {
    const env = createMockEnv();
    const app = buildApp(env);
    const res = await app.fetch("/api/payments/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validBody),
    });
    expect(res.status).toBe(401);
  });

  it("400s when required fields are missing", async () => {
    const env = createMockEnv();
    const app = buildApp(env);
    const res = await app.fetch("/api/payments/create", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ ...validBody, amount: 0 }),
    });
    expect(res.status).toBe(400);
  });

  it("400s when amount is over the cap (1,000,000)", async () => {
    const env = createMockEnv();
    const app = buildApp(env);
    const res = await app.fetch("/api/payments/create", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ ...validBody, amount: 2_000_000 }),
    });
    expect(res.status).toBe(400);
  });

  it("400s when returnUrl is on an untrusted domain", async () => {
    const env = createMockEnv();
    const app = buildApp(env);
    const res = await app.fetch("/api/payments/create", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ ...validBody, returnUrl: "https://evil.com/done" }),
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid returnUrl" });
  });

  it("allows localhost and trusted-domain subdomains", async () => {
    const env = createMockEnv({
      PAYNOW_INTEGRATION_ID: "int-id",
      PAYNOW_INTEGRATION_KEY: "int-key",
    });
    const { stub } = makeFetchStub([
      { match: pgrstMatch("rsvp_action", ["GET"]), handle: () => json({ id: "rsvp-1", agent_person_id: "person-1" }) },
      { match: pgrstMatch("event", ["GET"]), handle: () => json({ id: "evt-1", organizer_person_id: "host-1" }) },
      { match: pgrstMatch("payment_intents", ["POST"]), handle: () => json([{ id: "pay-1" }], 201) },
    ]);
    vi.stubGlobal("fetch", stub);

    const app = buildApp(env);
    const res = await app.fetch("/api/payments/create", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ ...validBody, returnUrl: "http://localhost:3000/done" }),
    });
    // PaynowProvider.createPayment is currently a stub returning {success: false};
    // route returns 200 + status:"error" rather than 201.
    expect(res.status).toBe(200);
    const body = await res.json() as { paymentId: string; status: string };
    expect(body.paymentId).toBe("pay-1");
    expect(body.status).toBe("error");
  });

  it("404s when the registration does not exist", async () => {
    const env = createMockEnv({
      PAYNOW_INTEGRATION_ID: "int-id",
      PAYNOW_INTEGRATION_KEY: "int-key",
    });
    const { stub } = makeFetchStub([
      { match: pgrstMatch("rsvp_action", ["GET"]), handle: () => notFoundSingle() },
    ]);
    vi.stubGlobal("fetch", stub);

    const app = buildApp(env);
    const res = await app.fetch("/api/payments/create", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify(validBody),
    });
    expect(res.status).toBe(404);
  });

  it("500s when the event has no organiser configured", async () => {
    const env = createMockEnv({
      PAYNOW_INTEGRATION_ID: "int-id",
      PAYNOW_INTEGRATION_KEY: "int-key",
    });
    const { stub } = makeFetchStub([
      { match: pgrstMatch("rsvp_action", ["GET"]), handle: () => json({ id: "rsvp-1", agent_person_id: "person-1" }) },
      { match: pgrstMatch("event", ["GET"]), handle: () => json({ id: "evt-1", organizer_person_id: null }) },
    ]);
    vi.stubGlobal("fetch", stub);

    const app = buildApp(env);
    const res = await app.fetch("/api/payments/create", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify(validBody),
    });
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Event organizer not configured" });
  });

  it("500s when Paynow secrets are missing from env", async () => {
    const env = createMockEnv({
      PAYNOW_INTEGRATION_ID: undefined,
      PAYNOW_INTEGRATION_KEY: undefined,
    });
    const { stub } = makeFetchStub([
      { match: pgrstMatch("rsvp_action", ["GET"]), handle: () => json({ id: "rsvp-1", agent_person_id: "person-1" }) },
      { match: pgrstMatch("event", ["GET"]), handle: () => json({ id: "evt-1", organizer_person_id: "host-1" }) },
      { match: pgrstMatch("payment_intents", ["POST"]), handle: () => json([{ id: "pay-1" }], 201) },
    ]);
    vi.stubGlobal("fetch", stub);

    const app = buildApp(env);
    const res = await app.fetch("/api/payments/create", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify(validBody),
    });
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Payment provider not configured" });
  });

  it("writes a payment_intent row with the expected shape", async () => {
    const env = createMockEnv({
      PAYNOW_INTEGRATION_ID: "int-id",
      PAYNOW_INTEGRATION_KEY: "int-key",
    });
    const { stub, calls } = makeFetchStub([
      { match: pgrstMatch("rsvp_action", ["GET"]), handle: () => json({ id: "rsvp-1", agent_person_id: "person-1" }) },
      { match: pgrstMatch("event", ["GET"]), handle: () => json({ id: "evt-1", organizer_person_id: "host-1" }) },
      { match: pgrstMatch("payment_intents", ["POST"]), handle: () => json([{ id: "pay-1" }], 201) },
    ]);
    vi.stubGlobal("fetch", stub);

    const app = buildApp(env);
    await app.fetch("/api/payments/create", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify(validBody),
    });
    const post = calls.find(c => c.method === "POST" && c.url.includes("/payment_intents"));
    expect(post!.body).toMatchObject({
      payer_identity_id: "person-1",
      payee_identity_id: "host-1",
      amount: 1500,
      currency_code: "USD",
      status: "pending",
      related_entity_type: "events.rsvp_action",
      related_entity_id: "rsvp-1",
    });
  });
});

// ============================================
// POST /api/payments/webhook
// ============================================

async function paynowHash(message: string, key: string): Promise<string> {
  const encoder = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(key),
    { name: "HMAC", hash: "SHA-512" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(message));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
}

describe("POST /api/payments/webhook", () => {
  const integrationKey = "test-paynow-key";

  it("400s when the hash field is missing", async () => {
    const env = createMockEnv({
      PAYNOW_INTEGRATION_ID: "int-id",
      PAYNOW_INTEGRATION_KEY: integrationKey,
    });
    const app = buildApp(env);
    const res = await app.fetch("/api/payments/webhook", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reference: "pay-1", status: "Paid" }),
    });
    expect(res.status).toBe(400);
  });

  it("400s when the HMAC does not match", async () => {
    const env = createMockEnv({
      PAYNOW_INTEGRATION_ID: "int-id",
      PAYNOW_INTEGRATION_KEY: integrationKey,
    });
    const app = buildApp(env);
    const res = await app.fetch("/api/payments/webhook", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reference: "pay-1", status: "Paid", hash: "WRONG" }),
    });
    expect(res.status).toBe(400);
  });

  // Paynow status → PaynowProvider internal status → wallet.payment_intents
  // CHECK-constraint value (the DB-stored "captured | cancelled | refunded |
  // pending | authorized | expired" enum). Paynow's "paid/delivered" maps
  // to captured, its "failed/cancelled" to cancelled, "refunded" to refunded.
  it.each([
    ["paid", "captured"],
    ["awaiting delivery", "captured"],
    ["delivered", "captured"],
    ["refunded", "refunded"],
    ["cancelled", "cancelled"],
    ["failed", "cancelled"],
  ])("maps Paynow status '%s' to DB status '%s'", async (paynowStatus, dbStatus) => {
    const env = createMockEnv({
      PAYNOW_INTEGRATION_ID: "int-id",
      PAYNOW_INTEGRATION_KEY: integrationKey,
    });

    const payload: Record<string, string> = {
      reference: "pay-1",
      status: paynowStatus,
    };
    const hashSource = Object.keys(payload).sort().map(k => payload[k]).join("");
    payload.hash = await paynowHash(hashSource, integrationKey);

    const { stub, calls } = makeFetchStub([
      { match: pgrstMatch("payment_intents", ["PATCH"]), handle: () => noContent() },
    ]);
    vi.stubGlobal("fetch", stub);

    const app = buildApp(env);
    const res = await app.fetch("/api/payments/webhook", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });

    const patch = calls[0];
    expect(patch.body).toMatchObject({ status: dbStatus });
    if (dbStatus === "captured") {
      expect((patch.body as { completed_at?: string }).completed_at).toBeTruthy();
    }
  });
});

// ============================================
// GET /api/payments/:id/status
// ============================================

describe("GET /api/payments/:id/status", () => {
  it("404s when payment intent does not exist", async () => {
    const env = createMockEnv();
    const { stub } = makeFetchStub([
      { match: pgrstMatch("payment_intents", ["GET"]), handle: () => notFoundSingle() },
    ]);
    vi.stubGlobal("fetch", stub);

    const app = buildApp(env);
    const res = await app.fetch("/api/payments/ghost/status", { headers: authHeaders() });
    expect(res.status).toBe(404);
  });

  it("returns amount in cents and surfaces completed_at", async () => {
    const env = createMockEnv();
    const { stub } = makeFetchStub([
      {
        match: pgrstMatch("payment_intents", ["GET"]),
        handle: () => json({
          id: "pay-1",
          // DB stores "captured"; route reverse-maps to "completed" on the wire.
          status: "captured",
          amount: 15.5,
          currency_code: "USD",
          created_at: "2026-05-01T00:00:00Z",
          completed_at: "2026-05-01T00:05:00Z",
        }),
      },
    ]);
    vi.stubGlobal("fetch", stub);

    const app = buildApp(env);
    const res = await app.fetch("/api/payments/pay-1/status", { headers: authHeaders() });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      payment: {
        id: "pay-1",
        status: "completed",
        amount_cents: 1550,
        currency: "USD",
        provider: "paynow",
        date_created: "2026-05-01T00:00:00Z",
        completed_at: "2026-05-01T00:05:00Z",
      },
    });
  });
});
