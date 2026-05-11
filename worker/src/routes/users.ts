import { Hono } from "hono";
import type { Env } from "../types";
import { getInitials } from "../utils/validation";
import { generateReferralCode } from "../utils/ids";
import { writeAuth } from "../middleware/auth";
import { logAudit } from "../utils/audit";
import { supabaseFetch } from "../db/supabase";

export const users = new Hono<{ Bindings: Env }>();
users.use("*", writeAuth);

// identity.person row excerpt (only fields this route reads/writes).
interface PersonRow {
  id: string;
  name: string;
  alternatename: string | null;
  image: string | null;
  address: Record<string, unknown> | null;
  knowsabout: string[] | null;
  onboarding_completed: boolean | null;
  role: string;
  email: string | null;
  created_at: string | null;
}

const PERSON_PUBLIC_COLS =
  "id,name,alternatename,image,address,knowsabout,onboarding_completed,role,created_at";

function mapPerson(p: PersonRow) {
  const addr = (p.address ?? {}) as Record<string, unknown>;
  return {
    id: p.id,
    name: p.name,
    alternateName: p.alternatename,
    image: p.image,
    addressLocality: (addr.addresslocality as string | undefined) ?? null,
    addressCountry: (addr.addresscountry as string | undefined) ?? null,
    interests: p.knowsabout ?? [],
    onboardingCompleted: p.onboarding_completed,
    role: p.role,
    dateCreated: p.created_at,
  };
}

// GET /api/users/:id — public fields. Resolves by uuid id OR alternatename
// (the legacy lookup-by-handle path).
users.get("/:id", async (c) => {
  const id = c.req.param("id");

  // Try by uuid first.
  let person = await supabaseFetch<PersonRow>(c.env, {
    schema: "identity",
    path: "person",
    query: `id=eq.${encodeURIComponent(id)}&select=${PERSON_PUBLIC_COLS}`,
    single: true,
  });

  if (!person) {
    person = await supabaseFetch<PersonRow>(c.env, {
      schema: "identity",
      path: "person",
      query: `alternatename=eq.${encodeURIComponent(id)}&select=${PERSON_PUBLIC_COLS}`,
      single: true,
    });
  }

  if (!person) {
    return c.json({ error: "User not found" }, 404);
  }

  return c.json({ user: mapPerson(person) });
});

// POST /api/users — minimal creation. Most user creation happens via the
// frontend Supabase auth-context (upsertPersonFromWorkos). This worker
// endpoint is preserved for legacy callers; it upserts on email.
users.post("/", async (c) => {
  const body = await c.req.json() as Record<string, unknown>;

  const insertBody = {
    email: body.email ?? null,
    name: body.name ?? "Unknown",
    alternatename: body.alternateName ?? null,
    address: {
      addresslocality: body.addressLocality ?? null,
      addresscountry: body.addressCountry ?? null,
    },
    knowsabout: Array.isArray(body.interests) ? body.interests : [],
    role: "user",
    sync_version: 1,
  };

  const inserted = await supabaseFetch<{ id: string }[]>(c.env, {
    schema: "identity",
    path: "person",
    method: "POST",
    body: insertBody,
  });

  return c.json({ id: inserted?.[0]?.id, message: "User created successfully" }, 201);
});

// GET /api/users/:id/referral-code — returns the user's "personal" referral
// code. Personal codes live in engagement.referral with target_entity_id =
// the user themselves (a referral code that's NOT scoped to a specific event
// is "the user's code" — the frontend picks an event later via /track).
users.get("/:id/referral-code", async (c) => {
  const userId = c.req.param("id");

  interface CodeRow { code: string }
  const row = await supabaseFetch<CodeRow>(c.env, {
    schema: "engagement",
    path: "referral",
    query: `referrer_person_id=eq.${encodeURIComponent(userId)}&target_entity_id=eq.${encodeURIComponent(userId)}&select=code&limit=1`,
    single: true,
  });

  if (!row) {
    return c.json({ error: "No referral code found" }, 404);
  }

  // Aggregate counters from the same code across all targets.
  const all = await supabaseFetch<{ status: string }[]>(c.env, {
    schema: "engagement",
    path: "referral",
    query: `code=eq.${encodeURIComponent(row.code)}&select=status`,
  }) ?? [];
  return c.json({
    code: row.code,
    totalReferrals: all.length,
    totalConversions: all.filter((r) => r.status === "converted").length,
  });
});

// POST /api/users/:id/referral-code — Create the user's personal code.
users.post("/:id/referral-code", async (c) => {
  const userId = c.req.param("id");

  const existing = await supabaseFetch<{ code: string }>(c.env, {
    schema: "engagement",
    path: "referral",
    query: `referrer_person_id=eq.${encodeURIComponent(userId)}&target_entity_id=eq.${encodeURIComponent(userId)}&select=code&limit=1`,
    single: true,
  });

  if (existing) {
    return c.json({ error: "User already has a referral code", code: existing.code }, 409);
  }

  const code = generateReferralCode();

  await supabaseFetch(c.env, {
    schema: "engagement",
    path: "referral",
    method: "POST",
    body: {
      referrer_person_id: userId,
      code,
      target_schema: "identity",
      target_entity_type: "identity.person",
      target_entity_id: userId,
      status: "pending",
    },
  });

  return c.json({ code }, 201);
});

// GET /api/users/:id/reputation — Aggregated host reputation stats.
users.get("/:id/reputation", async (c) => {
  const userId = c.req.param("id");

  const user = await supabaseFetch<{ id: string; name: string; alternatename: string | null }>(c.env, {
    schema: "identity",
    path: "person",
    query: `id=eq.${encodeURIComponent(userId)}&select=id,name,alternatename`,
    single: true,
  });

  if (!user) {
    return c.json({ error: "User not found" }, 404);
  }

  // Events hosted: events.event where organizer_person_id = userId
  // (the events.organiser role-table is a separate fan-out; for now we count
  // primary-organiser-only).
  const events = await supabaseFetch<{ attendee_count: number | null }[]>(c.env, {
    schema: "events",
    path: "event",
    query: `organizer_person_id=eq.${encodeURIComponent(userId)}&select=attendee_count`,
  }) ?? [];

  const eventsHosted = events.length;
  const totalAttendees = events.reduce((s, e) => s + (e.attendee_count ?? 0), 0);
  const avgAttendance = eventsHosted > 0 ? Math.round(totalAttendees / eventsHosted) : 0;

  // Reviews for this organizer's events (engagement.review with item_reviewed
  // pointing at any event whose organizer_person_id matches). Two queries.
  const eventIds = events.length
    ? (await supabaseFetch<{ id: string }[]>(c.env, {
        schema: "events",
        path: "event",
        query: `organizer_person_id=eq.${encodeURIComponent(userId)}&select=id`,
      })) ?? []
    : [];

  let avgRating = 0;
  let reviewCount = 0;
  if (eventIds.length > 0) {
    const ids = eventIds.map((e) => e.id).map(encodeURIComponent).join(",");
    const reviews = await supabaseFetch<{ rating_value: number }[]>(c.env, {
      schema: "engagement",
      path: "review",
      query: `item_reviewed_id=in.(${ids})&item_reviewed_type=eq.events.event&select=rating_value`,
    }) ?? [];
    reviewCount = reviews.length;
    if (reviewCount > 0) {
      avgRating = reviews.reduce((s, r) => s + (r.rating_value ?? 0), 0) / reviewCount;
    }
  }

  const badges: string[] = [];
  if (eventsHosted >= 10 && avgRating >= 4.5) badges.push("Trusted Host");
  if (eventsHosted >= 25) badges.push("Veteran");
  if (eventsHosted >= 5 && eventsHosted < 10 && avgRating >= 4.0) badges.push("Rising Star");
  if (reviewCount >= 50 && avgRating >= 4.8) badges.push("Community Favorite");
  if (avgAttendance >= 50) badges.push("Crowd Puller");

  return c.json({
    host: {
      userId: user.id,
      name: user.name,
      handle: user.alternatename || undefined,
      initials: getInitials(user.name),
      eventsHosted,
      totalAttendees,
      avgAttendance,
      rating: Math.round((avgRating || 0) * 10) / 10,
      reviewCount,
      badges,
    },
  });
});

// DELETE /api/users/:id — Soft-delete + PII anonymization.
// identity.person doesn't have a `deleted_at` column; we encode soft-deletion
// by overwriting PII to anonymized placeholders and pinning role='deleted'.
// (Surface design follows: anything sensitive is gone; consumers should treat
// role='deleted' as "do not show".)
users.delete("/:id", async (c) => {
  const userId = c.req.param("id");

  const user = await supabaseFetch<{ id: string; email: string | null; role: string }>(c.env, {
    schema: "identity",
    path: "person",
    query: `id=eq.${encodeURIComponent(userId)}&select=id,email,role`,
    single: true,
  });

  if (!user || user.role === "deleted") {
    return c.json({ error: "User not found" }, 404);
  }

  const anonymizedEmail = `deleted_${await hashEmail(user.email ?? userId)}@deleted.nhimbe.com`;

  await supabaseFetch(c.env, {
    schema: "identity",
    path: "person",
    query: `id=eq.${encodeURIComponent(userId)}`,
    method: "PATCH",
    body: {
      name: "Deleted User",
      email: anonymizedEmail,
      alternatename: null,
      image: null,
      knowsabout: [],
      address: null,
      role: "deleted",
    },
  });

  // Cancel future RSVPs by switching response to rsvpNo.
  await supabaseFetch(c.env, {
    schema: "events",
    path: "rsvp_action",
    query: `agent_person_id=eq.${encodeURIComponent(userId)}&rsvpresponse=neq.rsvpNo`,
    method: "PATCH",
    body: { rsvpresponse: "rsvpNo", updated_at: new Date().toISOString() },
  });

  const ipAddress = c.req.header("CF-Connecting-IP") || c.req.header("X-Forwarded-For") || null;

  await logAudit(c.env, {
    actorId: userId,
    action: "user.deleted",
    resourceType: "user",
    resourceId: userId,
    details: { method: "soft_delete" },
    ipAddress: ipAddress || undefined,
  });

  return c.json({ message: "User account deleted successfully" });
});

async function hashEmail(email: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(email.toLowerCase().trim());
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("").substring(0, 16);
}
