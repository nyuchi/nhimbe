/**
 * Identity helpers for routes that need to derive the requester's
 * `identity.person.id` from the WorkOS JWT.
 *
 * Centralises the workos_user_id → person_id lookup so route handlers don't
 * each implement it inline. Every write endpoint should use
 * `requireRequesterPersonId(c)` as its first step: it returns the person id
 * on success or a fully-formed 401 Response that the handler can return
 * directly.
 */
import type { Context } from "hono";
import type { Env } from "../types";
import { getAuthenticatedUser } from "./workos";
import { supabaseFetch } from "../db/supabase";
import { unauthorized } from "../utils/response";

/**
 * Look up the `identity.person.id` UUID for a given WorkOS user id.
 * Returns null if no live (non-soft-deleted) person row exists.
 */
export async function resolvePersonId(env: Env, workosUserId: string): Promise<string | null> {
  const row = await supabaseFetch<{ id: string }>(env, {
    schema: "identity",
    path: "person",
    query: `workos_user_id=eq.${encodeURIComponent(workosUserId)}&deleted_at=is.null&select=id&limit=1`,
    single: true,
  });
  return row?.id ?? null;
}

/**
 * Convenience for route handlers: validate the JWT, resolve the requester's
 * person id, and return either the id (string) or a 401 Response to short-
 * circuit the handler with.
 *
 * Usage:
 * ```ts
 * const r = await requireRequesterPersonId(c);
 * if (typeof r !== "string") return r;
 * const requesterPersonId = r;
 * ```
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function requireRequesterPersonId<E extends { Bindings: Env; Variables?: any }>(
  c: Context<E>,
): Promise<string | Response> {
  const authResult = await getAuthenticatedUser(c.req.raw, c.env);
  if (!authResult.user) {
    return unauthorized(c);
  }
  const personId = await resolvePersonId(c.env, authResult.user.userId);
  if (!personId) {
    return unauthorized(c, "onboarded user");
  }
  return personId;
}
