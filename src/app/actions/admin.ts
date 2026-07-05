"use server";

/**
 * Admin server actions (Vercel server runtime → MongoDB).
 *
 * Every export is an admin-gated Server Action: it calls `requireAdmin()`
 * first, which resolves the caller's identity.person.role via AuthKit and
 * redirects non-admins to "/" before any Mongo work happens. The read wrappers
 * back the client tables' search / pagination; the mutations back the row
 * actions (suspend/activate a user, cancel/moderate an event). Support-ticket
 * mutations are no-op stubs — that collection isn't modelled in v3.1 yet.
 */

import { requireAdmin } from "@/app/admin/require-admin";
import { eventsCollection, personsCollection } from "@/lib/mongo/databases";
import {
  listAdminEvents,
  listAdminUsers,
  listSupportTickets,
  type AdminEventsResult,
  type AdminUsersResult,
  type ListAdminEventsParams,
  type ListAdminUsersParams,
  type ListSupportTicketsParams,
  type SupportTicketsResult,
} from "@/lib/mongo/admin";

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

export async function fetchAdminSupport(
  params: ListSupportTicketsParams,
): Promise<SupportTicketsResult> {
  await requireAdmin();
  return listSupportTickets(params);
}

// ── user mutations ──────────────────────────────────────────────────

/**
 * Set `identity.persons.role`. Suspension/deletion are role-based in the
 * Mukoko model ("suspended" / "deleted"); we mirror `isActive` so the
 * `requireAdmin()` isActive===false gate also holds. Uses a loosely-typed
 * `$set` (like the profile action) because "suspended"/"deleted" live outside
 * the canonical PersonDoc.role union.
 */
async function writePersonRole(userId: string, role: string): Promise<{ message: string }> {
  const persons = await personsCollection();
  const set: Record<string, unknown> = { role, updatedAt: new Date() };
  set.isActive = !(role === "suspended" || role === "deleted");
  await persons.updateOne({ _id: userId }, { $set: set });
  return { message: "ok" };
}

export async function setUserRole(
  userId: string,
  role: string,
): Promise<{ message: string }> {
  await requireAdmin();
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

// ── event mutations ─────────────────────────────────────────────────

/** Set an event's lifecycle status to cancelled (+ schema.org eventStatus). */
async function writeEventCancelled(eventId: string): Promise<{ message: string }> {
  const events = await eventsCollection();
  const set: Record<string, unknown> = {
    status: "cancelled",
    eventStatus: "EventCancelled",
    updatedAt: new Date(),
  };
  await events.updateOne({ _id: eventId }, { $set: set });
  return { message: "ok" };
}

export async function cancelEvent(eventId: string): Promise<{ message: string }> {
  await requireAdmin();
  return writeEventCancelled(eventId);
}

/** Moderator action — currently just cancels the event (takes it offline). */
export async function moderateEvent(eventId: string): Promise<{ message: string }> {
  await requireAdmin();
  return writeEventCancelled(eventId);
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
