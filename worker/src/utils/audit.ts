import type { Env } from "../types";
import { supabaseFetch } from "../db/supabase";

export type AuditAction =
  | "event.created"
  | "event.updated"
  | "event.deleted"
  | "event.cancelled"
  | "user.created"
  | "user.updated"
  | "user.deleted"
  | "user.suspended"
  | "user.activated"
  | "user.role_changed"
  | "registration.created"
  | "registration.cancelled"
  | "registration.status_changed"
  | "admin.index_events";

/**
 * Append an audit entry to system.activity_logs on platform-db.
 * Failures are swallowed — audit must never break the calling flow.
 */
export async function logAudit(
  env: Env,
  params: {
    actorId?: string;
    action: AuditAction;
    resourceType: string;
    resourceId: string;
    details?: Record<string, unknown>;
    ipAddress?: string;
  },
): Promise<void> {
  try {
    await supabaseFetch(env, {
      schema: "system",
      path: "activity_logs",
      method: "POST",
      body: {
        user_id: params.actorId ?? null,
        action: params.action,
        entity_type: params.resourceType,
        entity_id: params.resourceId,
        metadata: params.details ?? null,
        ip_address: params.ipAddress ?? null,
      },
    });
  } catch (error) {
    console.error("[mukoko:audit] Failed to log audit event:", error);
  }
}
