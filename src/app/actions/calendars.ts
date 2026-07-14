"use server";

/**
 * Calendar server actions (NYU-25) — create, follow/unfollow, and the small
 * owner-scoped reads client surfaces need. Calendars are followable curated
 * event streams (the Luma pattern), NOT Circles: a Circle is a community, a
 * calendar is a stream of events that may belong to one.
 *
 * All writes resolve the acting person server-side via the shared
 * `resolveActingPerson` dance (WorkOS AuthKit session or the local dev
 * bypass) — the browser never passes person ids.
 */

import {
  createCalendar as createCalendarDoc,
  followCalendar as followCalendarWrite,
  unfollowCalendar as unfollowCalendarWrite,
  getCalendarById,
  canViewCalendar,
  listCalendarsByOwner,
} from "@/lib/mongo/calendars";
import { ensureHostEntityForPerson } from "@/lib/mongo/entities";
import { requireActingPerson, resolveActingPerson } from "@/lib/auth/current-person";
import { themes } from "@/lib/themes";
import type { CalendarVisibility } from "@/lib/mongo/types";

const MAX_NAME_LENGTH = 120;
const MAX_DESCRIPTION_LENGTH = 1000;
const VISIBILITIES: CalendarVisibility[] = ["public", "unlisted", "private"];

export interface CreateCalendarActionInput {
  name: string;
  description?: string | null;
  visibility?: CalendarVisibility;
  /** Optional owning circle — a calendar MAY belong to a community. */
  circleId?: string | null;
  /** Washed palette id from `src/lib/themes.ts`. */
  theme?: string | null;
}

export interface CreateCalendarResult {
  id: string;
  slug: string;
}

/** Create a calendar owned by the signed-in person (through their entity). */
export async function createCalendarAction(
  input: CreateCalendarActionInput,
): Promise<CreateCalendarResult> {
  const person = await requireActingPerson("You must be signed in to create a calendar.");

  // Server-side validation — this path is network-callable; never trust the client.
  const name = input.name?.trim() ?? "";
  if (!name) throw new Error("Calendar name is required.");
  if (name.length > MAX_NAME_LENGTH) {
    throw new Error(`Calendar name must be ${MAX_NAME_LENGTH} characters or fewer.`);
  }
  if ((input.description?.length ?? 0) > MAX_DESCRIPTION_LENGTH) {
    throw new Error(`Description must be ${MAX_DESCRIPTION_LENGTH} characters or fewer.`);
  }
  const visibility = input.visibility ?? "public";
  if (!VISIBILITIES.includes(visibility)) throw new Error("Invalid calendar visibility.");
  if (input.theme && !(input.theme in themes)) throw new Error("Unknown calendar theme.");

  const ownerEntityId = await ensureHostEntityForPerson(person);
  const doc = await createCalendarDoc({
    name,
    description: input.description ?? null,
    visibility,
    circleId: input.circleId ?? null,
    theme: input.theme ?? null,
    ownerPersonId: person._id,
    ownerEntityId,
  });
  return { id: doc._id, slug: doc.slug };
}

export interface FollowStateResult {
  following: boolean;
  /** The calendar's follower count after this action (best-effort read). */
  followerCount: number;
}

/** Follow a calendar as the signed-in person. Idempotent. */
export async function followCalendarAction(calendarId: string): Promise<FollowStateResult> {
  const person = await requireActingPerson("You must be signed in to follow a calendar.");

  const calendar = await getCalendarById(calendarId);
  if (!calendar || !canViewCalendar(calendar, person._id)) {
    throw new Error("That calendar could not be found.");
  }

  const followerEntityId = await ensureHostEntityForPerson(person);
  const { becameFollower } = await followCalendarWrite({
    calendarId,
    followerPersonId: person._id,
    followerEntityId,
  });
  return {
    following: true,
    followerCount: calendar.followerCount + (becameFollower ? 1 : 0),
  };
}

/** Unfollow a calendar as the signed-in person. Idempotent. */
export async function unfollowCalendarAction(calendarId: string): Promise<FollowStateResult> {
  const person = await requireActingPerson("You must be signed in to unfollow a calendar.");

  const calendar = await getCalendarById(calendarId);
  if (!calendar) throw new Error("That calendar could not be found.");

  const { stoppedFollowing } = await unfollowCalendarWrite({
    calendarId,
    followerPersonId: person._id,
  });
  return {
    following: false,
    followerCount: Math.max(0, calendar.followerCount - (stoppedFollowing ? 1 : 0)),
  };
}

/** Minimal calendar shape the create-event "add to calendar" select renders. */
export interface MyCalendarSummary {
  id: string;
  name: string;
}

/**
 * The signed-in person's own calendars (for the host-attach select). Returns
 * an empty array for anonymous visitors — the select simply doesn't render.
 */
export async function getMyCalendarsAction(): Promise<MyCalendarSummary[]> {
  const person = await resolveActingPerson();
  if (!person) return [];
  const docs = await listCalendarsByOwner(person._id);
  return docs.map((d) => ({ id: d._id, name: d.name }));
}
