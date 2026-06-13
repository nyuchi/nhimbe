"use server";

/**
 * Saved-event (bookmark) server actions — Vercel server runtime → MongoDB.
 *
 * Replaces the old browser-side direct-Supabase path in `use-save-event.ts`
 * (which wrote to `events.save_action` via the anon-key client). The browser
 * can't talk to MongoDB, so saving now runs server-side: the acting person is
 * resolved via AuthKit `withAuth()` (or the local dev bypass), and the bookmark
 * is persisted as one `events.savedEvents` document.
 *
 * Idempotency: a save is identified by the (person, event) pair, encoded as a
 * deterministic `_id` (`<personId>:<eventId>`). `saveEvent` upserts on that key,
 * so a second save — e.g. from another tab — is silently absorbed instead of
 * creating a duplicate. `unsaveEvent` is a plain delete on the same key.
 */

import { withAuth } from "@workos-inc/authkit-nextjs";
import { getCollection, DB, personsCollection } from "@/lib/mongo/databases";
import { WRITE_SCHEMA_VERSION } from "@/lib/mongo/ids";
import { syncPersonFromWorkos, type SyncPersonInput } from "@/lib/mongo/users";
import { isDevBypass, DEV_WORKOS_ID, DEV_EMAIL, DEV_NAME } from "@/lib/auth/dev";
import type { BaseDoc } from "@/lib/mongo/types";

/**
 * One bookmark row. Lives in `events.savedEvents`; the `_id` is the deterministic
 * `<personId>:<eventId>` composite that makes saves idempotent.
 */
interface SavedEventDoc extends BaseDoc {
  personId: string;
  eventId: string;
  savedAt: Date;
}

const savedEventsCollection = () =>
  getCollection<SavedEventDoc>(DB.events, "savedEvents");

/** Deterministic primary key for a (person, event) bookmark. */
function savedEventId(personId: string, eventId: string): string {
  return `${personId}:${eventId}`;
}

/**
 * Resolve the acting person's id (`identity.persons._id`) from the WorkOS
 * session or the dev bypass. Ensures the person doc exists (sync is idempotent).
 * Returns null when there is no session — callers treat that as "can't save".
 */
async function resolveActingPersonId(): Promise<string | null> {
  let syncInput: SyncPersonInput;
  if (isDevBypass()) {
    syncInput = {
      workosUserId: DEV_WORKOS_ID,
      email: DEV_EMAIL,
      name: DEV_NAME,
      emailVerified: true,
    };
  } else {
    const { user } = await withAuth();
    if (!user) return null;
    syncInput = {
      workosUserId: user.id,
      email: user.email ?? null,
      name: [user.firstName, user.lastName].filter(Boolean).join(" ").trim() || null,
      givenName: user.firstName ?? null,
      familyName: user.lastName ?? null,
      picture: user.profilePictureUrl ?? null,
      emailVerified: user.emailVerified ?? undefined,
    };
  }

  const persons = await personsCollection();
  let person = await persons.findOne({ workosUserId: syncInput.workosUserId });
  if (!person) {
    await syncPersonFromWorkos(syncInput);
    person = await persons.findOne({ workosUserId: syncInput.workosUserId });
  }
  return person?._id ?? null;
}

function requireEventId(eventId: string): string {
  const id = eventId?.trim() ?? "";
  if (!id) throw new Error("An event id is required.");
  return id;
}

/**
 * Is the current user's bookmark present for `eventId`? Returns false when
 * signed out (nothing to read).
 */
export async function isEventSaved(eventId: string): Promise<boolean> {
  const id = requireEventId(eventId);
  const personId = await resolveActingPersonId();
  if (!personId) return false;

  const col = await savedEventsCollection();
  const doc = await col.findOne({ _id: savedEventId(personId, id) });
  return !!doc;
}

/**
 * Save (bookmark) an event for the current user. Idempotent — re-saving is a
 * no-op. Returns the saved state (`true`) so the caller can sync optimistic UI.
 */
export async function saveEvent(eventId: string): Promise<boolean> {
  const id = requireEventId(eventId);
  const personId = await resolveActingPersonId();
  if (!personId) throw new Error("You must be signed in to save an event.");

  const now = new Date();
  const col = await savedEventsCollection();
  await col.updateOne(
    { _id: savedEventId(personId, id) },
    {
      $setOnInsert: {
        _schemaVersion: WRITE_SCHEMA_VERSION,
        personId,
        eventId: id,
        savedAt: now,
        createdAt: now,
      },
      $set: { updatedAt: now },
    },
    { upsert: true },
  );
  return true;
}

/**
 * Remove the current user's bookmark for an event. Idempotent — deleting a
 * non-existent save is a no-op. Returns the saved state (`false`).
 */
export async function unsaveEvent(eventId: string): Promise<boolean> {
  const id = requireEventId(eventId);
  const personId = await resolveActingPersonId();
  if (!personId) throw new Error("You must be signed in to manage saved events.");

  const col = await savedEventsCollection();
  await col.deleteOne({ _id: savedEventId(personId, id) });
  return false;
}
