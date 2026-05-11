import { Hono } from "hono";
import type { Env } from "../types";
import { writeAuth } from "../middleware/auth";
import { getAuthenticatedUser } from "../auth/workos";
import { supabaseFetch } from "../db/supabase";

export const kiosk = new Hono<{ Bindings: Env }>();

const PAIRING_TTL_SECONDS = 300;   // 5 min code claim window
const SESSION_TTL_SECONDS = 86400; // 24h paired session

type ScreenType = "kiosk" | "signage-host" | "signage-admin";
const VALID_SCREEN_TYPES: ScreenType[] = ["kiosk", "signage-host", "signage-admin"];

function generatePairingCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // No I/O/0/1 for readability
  let code = "";
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  for (let i = 0; i < 6; i++) code += chars[bytes[i] % chars.length];
  return code;
}

function generateSessionToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, "0")).join("");
}

function expiresAt(seconds: number): string {
  return new Date(Date.now() + seconds * 1000).toISOString();
}

// POST /api/kiosk/pair/request — Screen requests a pairing code.
// Writes device.pairing with status='pending' and no initiator (the host
// fills that in via /confirm). The code is the short-lived shared secret.
kiosk.post("/pair/request", async (c) => {
  const body = await c.req.json().catch(() => ({})) as { screenType?: string };
  const screenType = VALID_SCREEN_TYPES.includes(body.screenType as ScreenType)
    ? (body.screenType as ScreenType)
    : "kiosk";

  // Note: the device.pairing schema requires (context_schema, context_entity_type,
  // context_entity_id). At code-request time we don't yet know the event —
  // we use a placeholder all-zero UUID and patch the real event in on confirm.
  const PLACEHOLDER = "00000000-0000-0000-0000-000000000000";
  const code = generatePairingCode();

  await supabaseFetch(c.env, {
    schema: "device",
    path: "pairing",
    method: "POST",
    body: {
      code,
      context_schema: "events",
      context_entity_type: "events.event",
      context_entity_id: PLACEHOLDER,
      intended_device_type: screenType,
      status: "pending",
      expires_at: expiresAt(PAIRING_TTL_SECONDS),
    },
  });

  return c.json({ code, expiresIn: PAIRING_TTL_SECONDS, screenType });
});

interface PairingRow {
  code: string;
  status: string;
  intended_device_type: string;
  context_entity_id: string;
  initiated_by_person_id: string | null;
  expires_at: string;
}

// GET /api/kiosk/pair/:code/status — Screen polls until host confirms or expiry.
kiosk.get("/pair/:code/status", async (c) => {
  const code = c.req.param("code").toUpperCase();
  const now = new Date().toISOString();

  const row = await supabaseFetch<PairingRow>(c.env, {
    schema: "device",
    path: "pairing",
    query: `code=eq.${encodeURIComponent(code)}&expires_at=gt.${encodeURIComponent(now)}&select=code,status,intended_device_type,context_entity_id,initiated_by_person_id,expires_at`,
    single: true,
  });

  if (!row) {
    return c.json({ status: "expired" });
  }

  if (row.status !== "claimed" || row.context_entity_id === "00000000-0000-0000-0000-000000000000") {
    return c.json({ status: row.status, screenType: row.intended_device_type });
  }

  // Resolve event name + host info for the response (frontend uses both).
  interface EventRow { id: string; name: string; organizer: Record<string, unknown> | null }
  const event = await supabaseFetch<EventRow>(c.env, {
    schema: "events",
    path: "event",
    query: `id=eq.${encodeURIComponent(row.context_entity_id)}&select=id,name,organizer`,
    single: true,
  });

  return c.json({
    status: row.status,
    screenType: row.intended_device_type,
    eventId: row.context_entity_id,
    eventName: event?.name,
    hostName: (event?.organizer?.name as string | undefined),
    sessionToken: undefined, // session token only returned to the host on confirm
  });
});

// POST /api/kiosk/pair/:code/confirm — Host confirms pairing.
// Auth required: the signed-in WorkOS user owns the action and is recorded
// as initiated_by_person_id. We patch the pairing row to mark it claimed
// and bind it to the real event, then issue a session token to the host
// (the screen polls /status to discover the binding).
kiosk.post("/pair/:code/confirm", writeAuth, async (c) => {
  const code = c.req.param("code").toUpperCase();
  const body = await c.req.json() as { eventId: string };

  if (!body.eventId) {
    return c.json({ error: "eventId is required" }, 400);
  }

  const now = new Date().toISOString();

  const pairing = await supabaseFetch<PairingRow>(c.env, {
    schema: "device",
    path: "pairing",
    query: `code=eq.${encodeURIComponent(code)}&expires_at=gt.${encodeURIComponent(now)}&select=code,status,intended_device_type,context_entity_id,initiated_by_person_id,expires_at`,
    single: true,
  });

  if (!pairing) {
    return c.json({ error: "Pairing code expired or invalid" }, 404);
  }
  if (pairing.status !== "pending") {
    return c.json({ error: "Code already used" }, 409);
  }

  interface EventRow { id: string; name: string; organizer: Record<string, unknown> | null }
  const event = await supabaseFetch<EventRow>(c.env, {
    schema: "events",
    path: "event",
    query: `id=eq.${encodeURIComponent(body.eventId)}&select=id,name,organizer`,
    single: true,
  });

  if (!event) {
    return c.json({ error: "Event not found" }, 404);
  }

  const authResult = await getAuthenticatedUser(c.req.raw, c.env);
  // The pairing schema expects identity.person.id (uuid); the WorkOS userId
  // requires a person lookup. Keep null when not resolvable — the audit
  // trail still has WorkOS-side authentication for the confirm call.
  let initiatedByPersonId: string | null = null;
  if (authResult.user) {
    interface PersonRow { id: string }
    const person = await supabaseFetch<PersonRow>(c.env, {
      schema: "identity",
      path: "person",
      query: `workos_user_id=eq.${encodeURIComponent(authResult.user.userId)}&select=id`,
      single: true,
    });
    initiatedByPersonId = person?.id ?? null;
  }

  const sessionToken = generateSessionToken();
  const tokenHash = await sha256Hex(sessionToken);
  const sessionExpires = expiresAt(SESSION_TTL_SECONDS);

  await supabaseFetch(c.env, {
    schema: "device",
    path: "pairing",
    query: `code=eq.${encodeURIComponent(code)}`,
    method: "PATCH",
    body: {
      status: "claimed",
      context_entity_id: body.eventId,
      initiated_by_person_id: initiatedByPersonId,
      claimed_at: now,
    },
  });

  // device.session needs device_id NOT NULL; we use a synthetic per-pairing
  // device row for now (no separate enrolment flow yet).
  interface DeviceRow { id: string }
  const device = await supabaseFetch<DeviceRow[]>(c.env, {
    schema: "device",
    path: "device",
    method: "POST",
    body: {
      name: `${pairing.intended_device_type}-${code}`,
      device_type: pairing.intended_device_type,
      context_schema: "events",
      context_entity_type: "events.event",
      context_entity_id: body.eventId,
      owner_person_id: initiatedByPersonId,
      status: "active",
    },
  });
  const deviceId = device?.[0]?.id;

  if (deviceId) {
    await supabaseFetch(c.env, {
      schema: "device",
      path: "session",
      method: "POST",
      body: {
        device_id: deviceId,
        token_hash: tokenHash,
        expires_at: sessionExpires,
      },
    });
  }

  return c.json({
    message: "Screen paired successfully",
    eventName: event.name,
    screenType: pairing.intended_device_type,
    sessionToken,
  });
});

// GET /api/kiosk/session/:token — Validate a session token.
kiosk.get("/session/:token", writeAuth, async (c) => {
  const token = c.req.param("token");
  const tokenHash = await sha256Hex(token);
  const now = new Date().toISOString();

  interface SessionRow {
    device_id: string;
    started_at: string;
    expires_at: string;
    revoked_at: string | null;
  }
  const session = await supabaseFetch<SessionRow>(c.env, {
    schema: "device",
    path: "session",
    query: `token_hash=eq.${encodeURIComponent(tokenHash)}&expires_at=gt.${encodeURIComponent(now)}&revoked_at=is.null&select=device_id,started_at,expires_at,revoked_at`,
    single: true,
  });

  if (!session) {
    return c.json({ error: "Session expired or invalid" }, 401);
  }

  interface DeviceRow {
    id: string;
    device_type: string;
    context_entity_id: string | null;
    owner_person_id: string | null;
  }
  const device = await supabaseFetch<DeviceRow>(c.env, {
    schema: "device",
    path: "device",
    query: `id=eq.${encodeURIComponent(session.device_id)}&select=id,device_type,context_entity_id,owner_person_id`,
    single: true,
  });

  if (!device || !device.context_entity_id) {
    return c.json({ error: "Session has no bound event" }, 401);
  }

  interface EventNameRow { id: string; name: string }
  const event = await supabaseFetch<EventNameRow>(c.env, {
    schema: "events",
    path: "event",
    query: `id=eq.${encodeURIComponent(device.context_entity_id)}&select=id,name`,
    single: true,
  });

  return c.json({
    session: {
      eventId: device.context_entity_id,
      eventName: event?.name ?? "",
      screenType: device.device_type,
      hostId: device.owner_person_id,
      pairedAt: session.started_at,
    },
  });
});

// DELETE /api/kiosk/session/:token — Revoke a session.
kiosk.delete("/session/:token", writeAuth, async (c) => {
  const token = c.req.param("token");
  const tokenHash = await sha256Hex(token);

  await supabaseFetch(c.env, {
    schema: "device",
    path: "session",
    query: `token_hash=eq.${encodeURIComponent(tokenHash)}`,
    method: "PATCH",
    body: { revoked_at: new Date().toISOString() },
  });

  return c.json({ message: "Session ended" });
});
