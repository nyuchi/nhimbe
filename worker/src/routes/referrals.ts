import { Hono } from "hono";
import type { Env } from "../types";
import { writeAuth } from "../middleware/auth";
import { supabaseFetch } from "../db/supabase";

export const referrals = new Hono<{ Bindings: Env }>();

// All endpoints write — protect by origin/API-key.
referrals.use("*", writeAuth);

// POST /api/referrals/track
// Body: { eventId: string (uuid), referralCode: string, referredUserId?: string (uuid) }
// Looks up the referrer by code in engagement.referral, then writes a new
// referral row scoped to the event. The same `code` may map to multiple
// target entities — each track call records a fresh referral row.
referrals.post("/track", async (c) => {
  const body = await c.req.json() as {
    eventId: string;
    referralCode: string;
    referredUserId?: string;
  };

  if (!body.eventId || !body.referralCode) {
    return c.json({ error: "eventId and referralCode required" }, 400);
  }

  interface CodeRow { referrer_person_id: string }
  const codeRow = await supabaseFetch<CodeRow>(c.env, {
    schema: "engagement",
    path: "referral",
    query: `code=eq.${encodeURIComponent(body.referralCode)}&select=referrer_person_id&limit=1`,
    single: true,
  });

  if (!codeRow) {
    return c.json({ error: "Invalid referral code" }, 404);
  }

  interface InsertedRow { id: string }
  const inserted = await supabaseFetch<InsertedRow[]>(c.env, {
    schema: "engagement",
    path: "referral",
    method: "POST",
    body: {
      referrer_person_id: codeRow.referrer_person_id,
      referred_person_id: body.referredUserId ?? null,
      code: body.referralCode,
      target_schema: "events",
      target_entity_type: "events.event",
      target_entity_id: body.eventId,
      status: body.referredUserId ? "converted" : "pending",
      converted_at: body.referredUserId ? new Date().toISOString() : null,
    },
  });

  const id = inserted?.[0]?.id;

  if (c.env.ANALYTICS_QUEUE) {
    await c.env.ANALYTICS_QUEUE.send({
      type: "referral",
      eventId: body.eventId,
      userId: codeRow.referrer_person_id,
      data: { referralCode: body.referralCode, converted: !!body.referredUserId },
      timestamp: new Date().toISOString(),
    });
  }

  return c.json({ id, message: "Referral tracked" }, 201);
});
