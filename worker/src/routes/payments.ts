import { Hono } from "hono";
import type { Env } from "../types";
import { writeAuth } from "../middleware/auth";
import { notFound, badRequest } from "../utils/response";
import { PaynowProvider } from "../payments/paynow";
import { supabaseFetch } from "../db/supabase";

export const payments = new Hono<{ Bindings: Env }>();

// Payment-intent writes target wallet.payment_intents on platform-db. This is
// a thin tracker (status + reference); the full double-entry ledger lives in
// nyuchi_pay_db and will be plumbed through api.mukoko.com in a follow-up
// once that gateway is ready. The worker still drives the Paynow handshake
// to keep paid registrations working during the transition.

const ALLOWED_DOMAINS = ["nhimbe.com", "nyuchi.com", "mukoko.com"];

function returnUrlIsAllowed(returnUrl: string): boolean {
  try {
    const { hostname } = new URL(returnUrl);
    if (hostname === "localhost") return true;
    return ALLOWED_DOMAINS.some((d) => hostname === d || hostname.endsWith(`.${d}`));
  } catch {
    return false;
  }
}

// POST /api/payments/create — Create a payment intent.
payments.post("/create", writeAuth, async (c) => {
  const body = await c.req.json() as {
    registrationId: string;
    eventId: string;
    amount: number;
    currency?: string;
    returnUrl: string;
  };

  if (!body.registrationId || !body.eventId || !body.amount || !body.returnUrl) {
    return badRequest(c, "registrationId, eventId, amount, and returnUrl are required");
  }
  if (typeof body.amount !== "number" || body.amount <= 0 || body.amount > 1_000_000) {
    return badRequest(c, "Invalid amount");
  }
  if (!returnUrlIsAllowed(body.returnUrl)) {
    return badRequest(c, "Invalid returnUrl");
  }

  // Look up the RSVP — payer identity comes from rsvp_action.agent_person_id;
  // payee is the event organizer.
  interface RsvpRow { id: string; agent_person_id: string }
  const rsvp = await supabaseFetch<RsvpRow>(c.env, {
    schema: "events",
    path: "rsvp_action",
    query: `id=eq.${encodeURIComponent(body.registrationId)}&event_id=eq.${encodeURIComponent(body.eventId)}&select=id,agent_person_id`,
    single: true,
  });

  if (!rsvp) {
    return notFound(c, "Registration");
  }

  interface EventRow { id: string; organizer_person_id: string | null }
  const event = await supabaseFetch<EventRow>(c.env, {
    schema: "events",
    path: "event",
    query: `id=eq.${encodeURIComponent(body.eventId)}&select=id,organizer_person_id`,
    single: true,
  });

  if (!event || !event.organizer_person_id) {
    return c.json({ error: "Event organizer not configured" }, 500);
  }

  const currency = body.currency || "USD";

  interface InsertedRow { id: string }
  const inserted = await supabaseFetch<InsertedRow[]>(c.env, {
    schema: "wallet",
    path: "payment_intents",
    method: "POST",
    body: {
      payer_identity_id: rsvp.agent_person_id,
      payee_identity_id: event.organizer_person_id,
      amount: body.amount,
      currency_code: currency,
      purpose: "event_ticket",
      related_entity_type: "events.rsvp_action",
      related_entity_id: body.registrationId,
      status: "pending",
      metadata: { provider: "paynow", event_id: body.eventId },
    },
  });
  const paymentId = inserted?.[0]?.id;
  if (!paymentId) {
    return c.json({ error: "Failed to create payment intent" }, 500);
  }

  if (!c.env.PAYNOW_INTEGRATION_ID || !c.env.PAYNOW_INTEGRATION_KEY) {
    return c.json({ error: "Payment provider not configured" }, 500);
  }

  const provider = new PaynowProvider(c.env.PAYNOW_INTEGRATION_ID, c.env.PAYNOW_INTEGRATION_KEY);
  const result = await provider.createPayment({
    amount: body.amount,
    currency,
    reference: paymentId,
    description: `Registration ${body.registrationId} for event ${body.eventId}`,
    returnUrl: body.returnUrl,
  });

  if (result.success && result.providerReference) {
    await supabaseFetch(c.env, {
      schema: "wallet",
      path: "payment_intents",
      query: `id=eq.${encodeURIComponent(paymentId)}`,
      method: "PATCH",
      body: { metadata: { provider: "paynow", event_id: body.eventId, provider_reference: result.providerReference } },
    });
  }

  return c.json(
    {
      paymentId,
      redirectUrl: result.redirectUrl || null,
      status: result.success ? "created" : "error",
      error: result.error,
    },
    result.success ? 201 : 200,
  );
});

// POST /api/payments/webhook — Paynow status callback (HMAC-validated inside the provider).
payments.post("/webhook", async (c) => {
  const payload = await c.req.json();

  const provider = new PaynowProvider(
    c.env.PAYNOW_INTEGRATION_ID || "",
    c.env.PAYNOW_INTEGRATION_KEY || "",
  );
  const result = await provider.handleWebhook(payload);
  if (!result.valid || !result.reference || !result.status) {
    return badRequest(c, "Invalid webhook payload");
  }

  // Map provider-internal PaymentStatus to wallet.payment_intents.status
  // CHECK constraint values: pending | authorized | captured | cancelled |
  // refunded | expired. "completed" → captured, "failed" → cancelled.
  const PROVIDER_TO_DB_STATUS: Record<string, string> = {
    completed: "captured",
    refunded: "refunded",
    pending: "pending",
    failed: "cancelled",
    cancelled: "cancelled",
  };
  const dbStatus = PROVIDER_TO_DB_STATUS[result.status];
  if (!dbStatus) {
    return badRequest(c, "Invalid payment status");
  }

  const patch: Record<string, unknown> = { status: dbStatus };
  if (dbStatus === "captured") patch.completed_at = new Date().toISOString();

  await supabaseFetch(c.env, {
    schema: "wallet",
    path: "payment_intents",
    query: `id=eq.${encodeURIComponent(result.reference)}`,
    method: "PATCH",
    body: patch,
  });

  return c.json({ received: true });
});

// GET /api/payments/:id/status — Check payment status.
payments.get("/:id/status", writeAuth, async (c) => {
  const paymentId = c.req.param("id");

  interface IntentRow {
    id: string;
    status: string | null;
    amount: number;
    currency_code: string;
    created_at: string | null;
    completed_at: string | null;
  }
  const payment = await supabaseFetch<IntentRow>(c.env, {
    schema: "wallet",
    path: "payment_intents",
    query: `id=eq.${encodeURIComponent(paymentId)}&select=id,status,amount,currency_code,created_at,completed_at`,
    single: true,
  });

  if (!payment) {
    return notFound(c, "Payment");
  }

  // Reverse-map the DB enum back to the API surface the frontend knows
  // (mirror of PROVIDER_TO_DB_STATUS in the webhook handler).
  const DB_TO_API_STATUS: Record<string, string> = {
    pending: "pending",
    authorized: "pending",
    captured: "completed",
    cancelled: "failed",
    refunded: "refunded",
    expired: "failed",
  };
  const apiStatus = payment.status ? DB_TO_API_STATUS[payment.status] ?? payment.status : null;

  return c.json({
    payment: {
      id: payment.id,
      status: apiStatus,
      amount_cents: Math.round(Number(payment.amount) * 100),
      currency: payment.currency_code,
      provider: "paynow",
      date_created: payment.created_at,
      completed_at: payment.completed_at,
    },
  });
});
