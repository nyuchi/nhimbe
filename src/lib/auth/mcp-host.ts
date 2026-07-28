import "server-only";

/**
 * Bearer-authed HOST gate for the MCP host endpoints
 * (`/api/events/:id/registrations`, `/api/events/:id/analytics`,
 * `/api/events/:id/blast`).
 *
 * The cookie-session server actions (`src/app/actions/host-registrations.ts`,
 * `event-updates.ts`) gate host mutations on the acting person being able to
 * host through the event's entity. Machine/agent callers present a WorkOS
 * bearer instead of the session cookie, so this resolves the actor from the
 * bearer (`resolveActorFromBearer`) and applies the SAME entity-centric host
 * check, throwing `ActorError` with the HTTP status the route maps to JSON.
 *
 * The host check mirrors `canManageEventAction`: the acting person must host
 * through the event's `primaryHostEntityId` or one of its `hostEntityIds`.
 */

import { eventsCollection } from "@/lib/mongo/databases";
import { listHostEntitiesForPerson } from "@/lib/mongo/entities";
import { resolveActorFromBearer, ActorError } from "@/lib/auth/mcp-actor";
import type { EventDoc, PersonDoc } from "@/lib/mongo/types";

export { ActorError };

export interface HostContext {
  person: PersonDoc;
  event: EventDoc;
}

/**
 * Resolve the bearer's person and the event they addressed, verifying the
 * person hosts that event. `idOrSlug` may be an `_id`, `slug`, or short code.
 * Throws `ActorError` (401 unauthenticated, 404 unknown event, 403 not a host).
 */
export async function requireBearerEventHost(
  authorization: string | null,
  idOrSlug: string,
): Promise<HostContext> {
  const person = await resolveActorFromBearer(authorization);

  const events = await eventsCollection();
  const event = await events.findOne({
    $or: [{ _id: idOrSlug }, { slug: idOrSlug }, { "mukoko.shortCode": idOrSlug }],
  });
  if (!event) throw new ActorError("Event not found.", 404);

  const hostIds = new Set((await listHostEntitiesForPerson(person._id)).map((e) => e._id));
  const hosts =
    hostIds.has(event.primaryHostEntityId) ||
    (event.hostEntityIds ?? []).some((id) => hostIds.has(id));
  if (!hosts) {
    throw new ActorError("You do not host this event.", 403);
  }

  return { person, event };
}
