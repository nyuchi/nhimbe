/**
 * Recipient resolution for host-posted event updates (`events.updates` with
 * `notifyAttendees: true`) — who gets the email.
 *
 * Two audiences, both opt-out:
 *  - **Attendees** — yes/maybe RSVPs whose per-event `subscribedToUpdates`
 *    flag isn't false (set at RSVP time, default on).
 *  - **Event team** — active staff memberships on the event's host entity
 *    (the people running the event).
 *
 * The person-level `mukoko.notifications.eventUpdates` preference (profile
 * "Event updates" toggle) always wins: an explicit false suppresses delivery
 * for both audiences, whatever the per-RSVP flag says.
 */

import "server-only";
import {
  entityMembershipsCollection,
  personsCollection,
  rsvpsCollection,
} from "./databases";
import type { EntityMembershipRole, PersonDoc } from "./types";

/** Staff roles that count as the event team (mirrors HOSTABLE_ROLES). */
const TEAM_ROLES: EntityMembershipRole[] = [
  "founder",
  "admin",
  "manager",
  "representative",
];

/** Global opt-out: only an explicit false means unsubscribed. */
function wantsEventUpdates(p: PersonDoc): boolean {
  return p.mukoko?.notifications?.eventUpdates !== false;
}

export interface UpdateRecipient {
  email: string;
  name: string | null;
}

/**
 * Emails for everyone subscribed to a host update on this event, deduped,
 * excluding the author. Best-effort semantics belong to the caller.
 */
export async function listUpdateSubscribers(params: {
  eventId: string;
  hostEntityId: string;
  /** The update's author — never emails themself. */
  excludePersonId?: string;
}): Promise<UpdateRecipient[]> {
  const rsvpRows = await (await rsvpsCollection())
    .find({
      eventId: params.eventId,
      rsvpResponse: { $in: ["RsvpResponseYes", "RsvpResponseMaybe"] },
    })
    .project<{ attendeePersonId: string; subscribedToUpdates?: boolean | null }>({
      attendeePersonId: 1,
      subscribedToUpdates: 1,
    })
    .toArray();
  const attendeeIds = rsvpRows
    .filter((r) => r.subscribedToUpdates !== false)
    .map((r) => r.attendeePersonId);

  const teamRows = await (await entityMembershipsCollection())
    .find({
      entityId: params.hostEntityId,
      isActive: true,
      membershipRole: { $in: TEAM_ROLES },
    })
    .project<{ personId: string }>({ personId: 1 })
    .toArray();
  const teamIds = teamRows.map((m) => m.personId);

  const personIds = [...new Set([...attendeeIds, ...teamIds])].filter(
    (id) => id !== params.excludePersonId,
  );
  if (personIds.length === 0) return [];

  const persons = await (await personsCollection())
    .find({ _id: { $in: personIds } })
    .toArray();

  const recipients: UpdateRecipient[] = [];
  const seen = new Set<string>();
  for (const p of persons) {
    if (!p.email || p.isActive === false || !wantsEventUpdates(p)) continue;
    const key = p.email.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    recipients.push({ email: p.email, name: p.name ?? null });
  }
  return recipients;
}
