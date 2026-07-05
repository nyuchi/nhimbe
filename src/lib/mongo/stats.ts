/**
 * Event stats reads — attendance signals straight from MongoDB.
 *
 * Replaces the worker-era `/api/events/:id/stats` endpoint. These are the
 * plaintext operational counters (RSVPs, check-ins) that live alongside the
 * event in the `events` database; richer analytics (views, referrers, cities)
 * aren't modelled in v3.1 yet, so they default to zero.
 *
 * Server-only: pulls the Mongo collection accessors.
 */

import "server-only";
import { checkInsCollection, eventsCollection, rsvpsCollection } from "./databases";
import type { EventStats } from "@/lib/api";

/**
 * Attendance stats for one event. `rsvps` counts affirmative RSVPs and
 * `checkins` counts recorded check-ins — both are plaintext operational data.
 *
 * `views`/`uniqueViews`/`referrals`/`trend` default to 0: the v3.1 `EventDoc`
 * carries no view counter, and view/referral analytics have no home in the
 * current schema. Surface them here once the substrate grows those counters.
 */
export async function getEventStats(eventId: string): Promise<EventStats> {
  const [rsvps, checkIns] = await Promise.all([rsvpsCollection(), checkInsCollection()]);

  const [rsvpCount, checkinCount] = await Promise.all([
    rsvps.countDocuments({ eventId, rsvpResponse: "RsvpResponseYes" }),
    checkIns.countDocuments({ eventId }),
  ]);

  // Best-effort view counter: the v3.1 EventDoc has no dedicated field, but a
  // deployment may stash one under the free-form `mukoko` bag. Read it if
  // present, else 0 — never invent the field.
  const events = await eventsCollection();
  const doc = await events.findOne({ _id: eventId }, { projection: { mukoko: 1 } });
  const rawViews = (doc?.mukoko as Record<string, unknown> | undefined)?.viewCount;
  const views = typeof rawViews === "number" ? rawViews : 0;

  return {
    eventId,
    views,
    uniqueViews: 0,
    rsvps: rsvpCount,
    checkins: checkinCount,
    referrals: 0,
    trend: 0,
  };
}
