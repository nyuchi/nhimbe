"use server";

/**
 * Admin server actions (admin app server runtime → MongoDB).
 *
 * Every export is an admin-gated Server Action: it calls `requireAdmin()`
 * first, which resolves the caller's identity.person.role via AuthKit and
 * redirects unauthorised callers before any Mongo work happens. The read
 * wrappers back the client tables' search / pagination; the mutations back
 * the row actions (role/suspension management, event lifecycle transitions,
 * the feature toggle). Support-ticket mutations remain no-op stubs — that
 * collection isn't modelled in v3.1 yet.
 */

import { requireAdmin } from "@admin/lib/require-admin";
import { eventsCollection, personsCollection } from "@/lib/mongo/databases";
import {
  listAdminCalendars,
  listAdminCircles,
  listAdminEntities,
  listAdminEntityMembers,
  listAdminEvents,
  listAdminUsers,
  listSupportTickets,
  type AdminCalendarsResult,
  type AdminCirclesResult,
  type AdminEntitiesResult,
  type AdminEventsResult,
  type AdminUsersResult,
  type ListAdminCalendarsParams,
  type ListAdminCirclesParams,
  type ListAdminEntitiesParams,
  type ListAdminEventsParams,
  type ListAdminUsersParams,
  type ListSupportTicketsParams,
  type SupportTicketsResult,
} from "@/lib/mongo/admin";
import type { AdminEntityMember } from "@/lib/mongo/admin-types";

// ── reads (client search / pagination) ──────────────────────────────

export async function fetchAdminUsers(
  params: ListAdminUsersParams,
): Promise<AdminUsersResult> {
  await requireAdmin();
  return listAdminUsers(params);
}

export async function fetchAdminEvents(
  params: ListAdminEventsParams,
): Promise<AdminEventsResult> {
  await requireAdmin();
  return listAdminEvents(params);
}

export async function fetchAdminEntities(
  params: ListAdminEntitiesParams,
): Promise<AdminEntitiesResult> {
  await requireAdmin();
  return listAdminEntities(params);
}

export async function fetchAdminEntityMembers(
  entityId: string,
): Promise<AdminEntityMember[]> {
  await requireAdmin();
  return listAdminEntityMembers(entityId);
}

export async function fetchAdminCircles(
  params: ListAdminCirclesParams,
): Promise<AdminCirclesResult> {
  await requireAdmin();
  return listAdminCircles(params);
}

export async function fetchAdminCalendars(
  params: ListAdminCalendarsParams,
): Promise<AdminCalendarsResult> {
  await requireAdmin();
  return listAdminCalendars(params);
}

export async function fetchAdminSupport(
  params: ListSupportTicketsParams,
): Promise<SupportTicketsResult> {
  await requireAdmin();
  return listSupportTickets(params);
}

// ── people mutations ────────────────────────────────────────────────

const ASSIGNABLE_ROLES = ["user", "moderator", "admin", "super_admin"] as const;
type AssignableRole = (typeof ASSIGNABLE_ROLES)[number];

/**
 * Set `identity.persons.role`. Suspension/deletion are role-based in the
 * Mukoko model ("suspended" / "deleted"); we mirror `isActive` so the
 * requireAdmin() suspended gate also holds. Uses a loosely-typed `$set`
 * because "suspended"/"deleted" live outside the canonical PersonDoc.role
 * union.
 */
async function writePersonRole(userId: string, role: string): Promise<{ message: string }> {
  const persons = await personsCollection();
  const set: Record<string, unknown> = { role, updatedAt: new Date() };
  set.isActive = !(role === "suspended" || role === "deleted");
  await persons.updateOne({ _id: userId }, { $set: set });
  return { message: "ok" };
}

/**
 * Admin-flag management. Granting elevated roles (admin / super_admin) —
 * and touching an account that already holds one — requires super_admin;
 * everything else gates at admin (matching the extracted contract).
 */
export async function setUserRole(
  userId: string,
  role: string,
): Promise<{ message: string }> {
  if (!ASSIGNABLE_ROLES.includes(role as AssignableRole)) {
    throw new Error(`[mukoko] setUserRole: unknown role "${role}"`);
  }

  const requester = await requireAdmin();

  const persons = await personsCollection();
  const target = await persons.findOne({ _id: userId });
  const targetRole = typeof target?.role === "string" ? target.role : "user";

  const touchesElevated =
    role === "admin" ||
    role === "super_admin" ||
    targetRole === "admin" ||
    targetRole === "super_admin";
  if (touchesElevated && requester.role !== "super_admin") {
    await requireAdmin("super_admin"); // redirects to /denied
  }

  return writePersonRole(userId, role);
}

export async function suspendUser(userId: string): Promise<{ message: string }> {
  await requireAdmin();
  return writePersonRole(userId, "suspended");
}

export async function activateUser(userId: string): Promise<{ message: string }> {
  await requireAdmin();
  return writePersonRole(userId, "user");
}

// ── event mutations (lifecycle transitions + feature toggle) ────────

async function writeEventStatus(
  eventId: string,
  set: Record<string, unknown>,
): Promise<{ message: string }> {
  const events = await eventsCollection();
  await events.updateOne({ _id: eventId }, { $set: { ...set, updatedAt: new Date() } });
  return { message: "ok" };
}

/** Publish (or re-publish) an event: lifecycle + schema.org eventStatus. */
export async function publishEvent(eventId: string): Promise<{ message: string }> {
  await requireAdmin();
  return writeEventStatus(eventId, {
    status: "published",
    eventStatus: "EventScheduled",
  });
}

/** Cancel an event (never hard-deleted so RSVP history stays intact). */
export async function cancelEvent(eventId: string): Promise<{ message: string }> {
  await requireAdmin();
  return writeEventStatus(eventId, {
    status: "cancelled",
    eventStatus: "EventCancelled",
  });
}

/** Archive an event — takes it off every public surface without cancelling. */
export async function archiveEvent(eventId: string): Promise<{ message: string }> {
  await requireAdmin();
  return writeEventStatus(eventId, { status: "archived" });
}

/** Moderator action — currently just cancels the event (takes it offline). */
export async function moderateEvent(eventId: string): Promise<{ message: string }> {
  await requireAdmin();
  return writeEventStatus(eventId, {
    status: "cancelled",
    eventStatus: "EventCancelled",
  });
}

/** Toggle the admin feature flag (events.events.mukoko.featured). */
export async function setEventFeatured(
  eventId: string,
  featured: boolean,
): Promise<{ message: string }> {
  await requireAdmin();
  return writeEventStatus(eventId, { "mukoko.featured": featured });
}

// ── support mutations (stubs) ───────────────────────────────────────

export async function updateSupportTicketStatus(
  _ticketId: string,
  _status: string,
): Promise<{ message: string }> {
  await requireAdmin();
  // No support-ticket collection exists in the Mukoko v3.1 schema — this is a
  // no-op so the admin UI's status buttons resolve cleanly.
  return { message: "ok" };
}

export async function replyToSupportTicket(
  _ticketId: string,
  _content: string,
): Promise<{ message: string }> {
  await requireAdmin();
  // See updateSupportTicketStatus — support tickets aren't modelled yet.
  return { message: "ok" };
}
