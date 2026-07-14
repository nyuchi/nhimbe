/**
 * POST /api/webhooks/workos — WorkOS event webhook (issue #70).
 *
 * Guaranteed user provisioning: WorkOS pushes user and organization-membership
 * events here so `identity.persons` and `entity.memberships` mirror the WorkOS
 * directory without depending on the user ever rendering a page. This is the
 * push leg of a three-layer guarantee — callback `onSuccess` (synchronous, at
 * login) and the lazy `resolveActingPerson` sync (on first action) remain as
 * fallbacks.
 *
 * Contract:
 * - Signature-verified via the WorkOS SDK (`webhooks.constructEvent` over the
 *   raw body + `workos-signature` header). Bad/missing signature → 401;
 *   `WORKOS_WEBHOOK_SECRET` unset → 503 (endpoint not configured).
 * - Handled and ignored events answer 200 quickly. Handlers are idempotent
 *   (keyed upserts), so WorkOS retries/replays are always safe.
 * - A failed mirror write answers 500 so WorkOS retries — that retry loop is
 *   what makes provisioning "guaranteed" rather than best-effort.
 */

import { NextResponse } from "next/server";
import { getWorkOS } from "@workos-inc/authkit-nextjs";
import { createLogger } from "@/lib/observability";
import {
  deactivatePersonByWorkosId,
  syncInputFromWorkosUser,
  syncPersonFromWorkos,
} from "@/lib/mongo/users";
import {
  endWorkosOrganizationMembership,
  mirrorWorkosOrganizationMembership,
} from "@/lib/mongo/entities";

export const runtime = "nodejs";

const log = createLogger("workos-webhook");

/** The verified WorkOS event union, as returned by the SDK. */
type WorkosEvent = Awaited<ReturnType<ReturnType<typeof getWorkOS>["webhooks"]["constructEvent"]>>;

export async function POST(request: Request): Promise<NextResponse> {
  const secret = process.env.WORKOS_WEBHOOK_SECRET;
  if (!secret) {
    // Misconfiguration, not a client error. Never log the secret itself.
    log.warn("WORKOS_WEBHOOK_SECRET is not set — webhook endpoint disabled");
    return NextResponse.json({ error: "Webhook is not configured" }, { status: 503 });
  }

  const sigHeader = request.headers.get("workos-signature");
  if (!sigHeader) {
    log.warn("Rejected WorkOS webhook without a signature header");
    return NextResponse.json({ error: "Missing signature" }, { status: 401 });
  }

  // Verify over the RAW body — any reserialization would break the HMAC.
  const payload = await request.text();

  let event: WorkosEvent;
  try {
    event = await getWorkOS().webhooks.constructEvent({ payload, sigHeader, secret });
  } catch {
    log.warn("Rejected WorkOS webhook with an invalid signature");
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  try {
    const handled = await handleEvent(event);
    if (handled) {
      log.info("Processed WorkOS event", { data: { eventType: event.event, eventId: event.id } });
    } else {
      log.debug("Ignoring unhandled WorkOS event type", {
        data: { eventType: event.event, eventId: event.id },
      });
    }
  } catch (error) {
    log.error("WorkOS event processing failed", {
      data: { eventType: event.event, eventId: event.id },
      error: error instanceof Error ? error : new Error(String(error)),
    });
    // 500 → WorkOS retries; handlers are idempotent so the replay is safe.
    return NextResponse.json({ error: "Event processing failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

/** Dispatch one verified event. Returns false for event types nhimbe ignores. */
async function handleEvent(event: WorkosEvent): Promise<boolean> {
  switch (event.event) {
    case "user.created":
    case "user.updated": {
      // Same idempotent upsert as the callback + lazy sync — keyed on the
      // WorkOS user id, so signup, update and replay all converge.
      await syncPersonFromWorkos(syncInputFromWorkosUser(event.data));
      return true;
    }

    case "user.deleted": {
      const matched = await deactivatePersonByWorkosId(event.data.id);
      if (!matched) {
        log.debug("user.deleted for a person nhimbe never saw — nothing to deactivate", {
          data: { workosUserId: event.data.id },
        });
      }
      return true;
    }

    case "organization_membership.created":
    case "organization_membership.updated": {
      await mirrorWorkosOrganizationMembership({
        workosOrganizationMembershipId: event.data.id,
        workosOrganizationId: event.data.organizationId,
        organizationName: event.data.organizationName,
        workosUserId: event.data.userId,
        roleSlug: event.data.role?.slug ?? null,
        status: event.data.status,
      });
      return true;
    }

    case "organization_membership.deleted": {
      await endWorkosOrganizationMembership({
        workosOrganizationMembershipId: event.data.id,
      });
      return true;
    }

    default:
      return false;
  }
}
