import { createMiddleware } from "hono/factory";
import type { Env, UserRole } from "../types";
import { hasPermission } from "../types";
import { getAuthenticatedUser } from "../auth/workos";
import { supabaseFetch } from "../db/supabase";

// Trusted domains — always allow these and all their subdomains
const TRUSTED_DOMAINS = ["nyuchi.com", "mukoko.com", "nhimbe.com"];

// Check if request origin is allowed
export function isAllowedOrigin(request: Request, env: Env): boolean {
  const origin = request.headers.get("Origin") || "";
  if (!origin) return false;

  // Always allow localhost in development
  if (origin.startsWith("http://localhost:")) return true;

  try {
    const url = new URL(origin);
    const hostname = url.hostname;
    // Allow trusted domains and all their subdomains
    if (TRUSTED_DOMAINS.some(domain => hostname === domain || hostname.endsWith(`.${domain}`))) {
      return true;
    }
  } catch {
    // Invalid origin URL
  }

  // Also check ALLOWED_ORIGINS env var for any additional origins
  const extraOrigins = (env.ALLOWED_ORIGINS || "").split(",").filter(Boolean);
  return extraOrigins.some(allowed => origin === allowed.trim());
}

// Validate API key from request (timing-safe comparison)
export function validateApiKey(request: Request, env: Env): boolean {
  const apiKey = request.headers.get("X-API-Key") || request.headers.get("Authorization")?.replace("Bearer ", "");
  if (!apiKey || !env.API_KEY) return false;

  const encoder = new TextEncoder();
  const a = encoder.encode(apiKey);
  const b = encoder.encode(env.API_KEY);

  if (a.byteLength !== b.byteLength) return false;

  return crypto.subtle.timingSafeEqual(a, b);
}

// Middleware: require API key or allowed origin for write operations
export const writeAuth = createMiddleware<{ Bindings: Env }>(async (c, next) => {
  if (["POST", "PUT", "DELETE"].includes(c.req.method)) {
    if (!validateApiKey(c.req.raw, c.env) && !isAllowedOrigin(c.req.raw, c.env)) {
      return c.json({ error: "Unauthorized" }, 401);
    }
  }
  await next();
});

// Middleware: require API key (admin endpoints)
export const apiKeyRequired = createMiddleware<{ Bindings: Env }>(async (c, next) => {
  if (!validateApiKey(c.req.raw, c.env)) {
    return c.json({ error: "Unauthorized - API key required" }, 401);
  }
  await next();
});

// Helper: get authenticated admin user with role check (not middleware — used inline)
export interface AdminUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
}

interface IdentityPersonRow {
  id: string;
  email: string | null;
  name: string | null;
  role: string | null;
}

// `identity.person.role` is constrained to one of:
//   user | creator | moderator | support | admin | superadmin | employee | developer
// Map to the worker's UserRole hierarchy at the boundary so callers keep
// using hasPermission(userRole, requiredRole) without caring about the
// source-of-truth strings.
function mapPlatformRole(raw: string | null): UserRole {
  switch (raw) {
    case "superadmin":
    case "developer":
      return "super_admin";
    case "admin":
    case "employee":
      return "admin";
    case "moderator":
    case "support":
      return "moderator";
    case "user":
    case "creator":
    default:
      return "user";
  }
}

export async function getAdminUser(request: Request, env: Env, requiredRole: UserRole): Promise<AdminUser | null> {
  const authResult = await getAuthenticatedUser(request, env);
  if (!authResult.user) return null;
  const authUser = authResult.user;

  // Reads `identity.person` in nyuchi_platform_db via PostgREST with the
  // service-role key (bypasses RLS — this is a trusted server-side lookup).
  // Replaces the previous D1 `users` table query; the worker no longer
  // owns a copy of the user record.
  // Filter out soft-deleted accounts at the query level so a stale JWT
  // for a removed admin can't reach this code path.
  const rows = await supabaseFetch<IdentityPersonRow[]>(env, {
    schema: "identity",
    path: "person",
    query: `workos_user_id=eq.${encodeURIComponent(authUser.userId)}&deleted_at=is.null&select=id,email,name,role&limit=1`,
  });
  const person = rows && rows.length > 0 ? rows[0] : null;
  if (!person) return null;

  const userRole = mapPlatformRole(person.role);
  if (!hasPermission(userRole, requiredRole)) return null;

  return {
    id: person.id,
    email: person.email ?? "",
    name: person.name ?? "",
    role: userRole,
  };
}
