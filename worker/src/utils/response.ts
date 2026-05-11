import type { Context } from "hono";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-API-Key",
};

// Legacy jsonResponse for status page and non-Hono contexts
export function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders,
    },
  });
}

export { corsHeaders };

// ============================================
// Hono response helpers — keep error shapes uniform across all 18 routes.
// Use these instead of inline c.json({ error: "..." }, status).
// ============================================

/**
 * 401 Unauthorized. `role` is appended as "Unauthorized - {role} access required"
 * when supplied, matching the historical pattern in admin.ts.
 */
export function unauthorized(c: Context, role?: string) {
  const message = role
    ? `Unauthorized - ${role} access required`
    : "Unauthorized";
  return c.json({ error: message }, 401);
}

/** 403 Forbidden. */
export function forbidden(c: Context, message = "Forbidden") {
  return c.json({ error: message }, 403);
}

/** 404 Not Found. `entity` is rendered as "{Entity} not found" when supplied. */
export function notFound(c: Context, entity?: string) {
  const message = entity ? `${entity} not found` : "Not found";
  return c.json({ error: message }, 404);
}

/** 400 Bad Request. */
export function badRequest(c: Context, message: string) {
  return c.json({ error: message }, 400);
}

/** 409 Conflict — for double-submit / state-collision cases. */
export function conflict(c: Context, message: string, extra?: Record<string, unknown>) {
  return c.json({ error: message, ...(extra ?? {}) }, 409);
}
