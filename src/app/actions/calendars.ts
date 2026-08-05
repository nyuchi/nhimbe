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
  updateCalendar as updateCalendarWrite,
  archiveCalendar as archiveCalendarWrite,
  getCalendarById,
  canViewCalendar,
  listCalendarsByOwner,
  listFollowedCalendars,
} from "@/lib/mongo/calendars";
import { ensureHostEntityForPerson, listHostEntitiesForPerson } from "@/lib/mongo/entities";
import { listCirclesByOwner, type OwnedCircle } from "@/lib/mongo/circles";
import { circlesCollection } from "@/lib/mongo/databases";
import { ensureCalendarConversation } from "@/lib/mongo/campfire";
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
  /** Who curates the calendar — mirrors the create-event host picker. */
  hostMode?: "person" | "organization" | "family";
  hostEntityId?: string | null;
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
  if ((input.hostMode === "organization" || input.hostMode === "family") && !input.hostEntityId) {
    throw new Error(`Pick which ${input.hostMode} is hosting, or switch back to a personal host.`);
  }

  // A calendar may only attach to a circle the creator owns.
  if (input.circleId) {
    const circles = await circlesCollection();
    const circle = await circles.findOne(
      { _id: input.circleId, ownerPersonId: person._id, isActive: true },
      { projection: { _id: 1 } },
    );
    if (!circle) throw new Error("You can only attach a calendar to a circle you own.");
  }

  // Resolve the host entity: an explicitly picked org/family the person can
  // actually host through, else the person's (lazily created) default entity.
  let ownerEntityId: string;
  if ((input.hostMode === "organization" || input.hostMode === "family") && input.hostEntityId) {
    const hostable = await listHostEntitiesForPerson(person._id);
    if (!hostable.some((e) => e._id === input.hostEntityId)) {
      throw new Error("You do not have permission to host a calendar through that entity.");
    }
    ownerEntityId = input.hostEntityId;
  } else {
    ownerEntityId = await ensureHostEntityForPerson(person);
  }

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

/** The signed-in person's own circles (for the create-calendar circle picker). */
export async function getMyCirclesAction(): Promise<OwnedCircle[]> {
  const person = await resolveActingPerson();
  if (!person) return [];
  return listCirclesByOwner(person._id);
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
  const hostEntities = await listHostEntitiesForPerson(person._id);
  const docs = await listCalendarsByOwner(person._id, hostEntities.map((e) => e._id));
  return docs.map((d) => ({ id: d._id, name: d.name }));
}

/** The fuller card shape the `/calendars` "My calendars" page renders. */
export interface CalendarListItem {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  visibility: CalendarVisibility;
  theme: string | null;
  circleId: string | null;
  followerCount: number;
  eventCount: number;
}

function toListItem(d: {
  _id: string;
  slug: string;
  name: string;
  description?: string | null;
  visibility: CalendarVisibility;
  theme?: string | null;
  circleId?: string | null;
  followerCount: number;
  eventCount: number;
}): CalendarListItem {
  return {
    id: d._id,
    slug: d.slug,
    name: d.name,
    description: d.description ?? null,
    visibility: d.visibility,
    theme: d.theme ?? null,
    circleId: d.circleId ?? null,
    followerCount: d.followerCount,
    eventCount: d.eventCount,
  };
}

/** The signed-in person's own calendars, full card shape. Empty for anonymous visitors. */
export async function getMyOwnedCalendarsAction(): Promise<CalendarListItem[]> {
  const person = await resolveActingPerson();
  if (!person) return [];
  const hostEntities = await listHostEntitiesForPerson(person._id);
  const docs = await listCalendarsByOwner(person._id, hostEntities.map((e) => e._id));
  return docs.map(toListItem);
}

/** Calendars the signed-in person follows, full card shape. Empty for anonymous visitors. */
export async function getFollowedCalendarsAction(): Promise<CalendarListItem[]> {
  const person = await resolveActingPerson();
  if (!person) return [];
  const docs = await listFollowedCalendars(person._id);
  return docs.map(toListItem);
}

export interface UpdateCalendarActionInput {
  calendarId: string;
  name?: string;
  description?: string | null;
  visibility?: CalendarVisibility;
  theme?: string | null;
  circleId?: string | null;
}

/** Update a calendar's editable fields. Owner-only. */
export async function updateCalendarAction(
  input: UpdateCalendarActionInput,
): Promise<CalendarListItem> {
  const person = await requireActingPerson("You must be signed in to edit a calendar.");
  const calendar = await getCalendarById(input.calendarId);
  if (!calendar || calendar.ownerPersonId !== person._id) {
    throw new Error("You can only edit your own calendars.");
  }

  const name = input.name !== undefined ? input.name.trim() : undefined;
  if (name !== undefined && !name) throw new Error("Calendar name is required.");
  if (name !== undefined && name.length > MAX_NAME_LENGTH) {
    throw new Error(`Calendar name must be ${MAX_NAME_LENGTH} characters or fewer.`);
  }
  if ((input.description?.length ?? 0) > MAX_DESCRIPTION_LENGTH) {
    throw new Error(`Description must be ${MAX_DESCRIPTION_LENGTH} characters or fewer.`);
  }
  if (input.visibility && !VISIBILITIES.includes(input.visibility)) {
    throw new Error("Invalid calendar visibility.");
  }
  if (input.theme && !(input.theme in themes)) throw new Error("Unknown calendar theme.");
  if (input.circleId) {
    const circles = await circlesCollection();
    const circle = await circles.findOne(
      { _id: input.circleId, ownerPersonId: person._id, isActive: true },
      { projection: { _id: 1 } },
    );
    if (!circle) throw new Error("You can only attach a calendar to a circle you own.");
  }

  const updated = await updateCalendarWrite(input.calendarId, {
    name,
    description: input.description,
    visibility: input.visibility,
    theme: input.theme,
    circleId: input.circleId,
  });
  if (!updated) throw new Error("That calendar could not be updated.");
  return toListItem(updated);
}

/** Archive (soft-delete) a calendar. Owner-only. */
export async function archiveCalendarAction(calendarId: string): Promise<void> {
  const person = await requireActingPerson("You must be signed in to archive a calendar.");
  const calendar = await getCalendarById(calendarId);
  if (!calendar || calendar.ownerPersonId !== person._id) {
    throw new Error("You can only archive your own calendars.");
  }
  await archiveCalendarWrite(calendarId);
}

/**
 * Resolve (creating on first use) the calendar's paired "Discuss" campfire
 * conversation. Any signed-in visitor who can view the calendar may open it.
 */
export async function ensureCalendarConversationAction(calendarId: string): Promise<string> {
  const person = await requireActingPerson("You must be signed in to discuss a calendar.");
  const calendar = await getCalendarById(calendarId);
  if (!calendar || !canViewCalendar(calendar, person._id)) {
    throw new Error("That calendar could not be found.");
  }
  const conversation = await ensureCalendarConversation({
    calendarId,
    calendarName: calendar.name,
    createdByPersonId: calendar.ownerPersonId,
  });
  return conversation._id;
}
