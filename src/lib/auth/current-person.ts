import "server-only";

/**
 * Shared "who is acting right now" resolver for server actions.
 *
 * Several write paths (saves, tracked links, …) need the signed-in person's
 * `identity.persons` document, resolved from either the WorkOS AuthKit session
 * or the local dev bypass, with a lazy idempotent sync so a first-time visitor
 * still gets a person doc. This centralises that dance — previously copy-pasted
 * into every action — so there is one place that knows how a WorkOS identity
 * maps onto a Mukoko person.
 */

import { withAuth } from "@workos-inc/authkit-nextjs";
import { personsCollection } from "@/lib/mongo/databases";
import { syncPersonFromWorkos, type SyncPersonInput } from "@/lib/mongo/users";
import { isDevBypass, DEV_WORKOS_ID, DEV_EMAIL, DEV_NAME } from "@/lib/auth/dev";
import type { PersonDoc } from "@/lib/mongo/types";

/**
 * Build the person-sync input for the current request: the dev bypass identity
 * when active, otherwise the WorkOS session user. Returns `null` when there is
 * no session (anonymous visitor).
 */
export async function resolveActingSyncInput(): Promise<SyncPersonInput | null> {
  if (isDevBypass()) {
    return { workosUserId: DEV_WORKOS_ID, email: DEV_EMAIL, name: DEV_NAME, emailVerified: true };
  }
  const { user } = await withAuth();
  if (!user) return null;
  return {
    workosUserId: user.id,
    email: user.email ?? null,
    name: [user.firstName, user.lastName].filter(Boolean).join(" ").trim() || null,
    givenName: user.firstName ?? null,
    familyName: user.lastName ?? null,
    picture: user.profilePictureUrl ?? null,
    emailVerified: user.emailVerified ?? undefined,
  };
}

/**
 * Resolve the acting person's `identity.persons` document, syncing it from
 * WorkOS on first sight. Returns `null` for anonymous visitors — callers decide
 * whether that is a soft "nothing to do" or a hard "must be signed in".
 */
export async function resolveActingPerson(): Promise<PersonDoc | null> {
  const syncInput = await resolveActingSyncInput();
  if (!syncInput) return null;

  const persons = await personsCollection();
  let person = await persons.findOne({ workosUserId: syncInput.workosUserId });
  if (!person) {
    await syncPersonFromWorkos(syncInput);
    person = await persons.findOne({ workosUserId: syncInput.workosUserId });
  }
  return person ?? null;
}

/**
 * Like {@link resolveActingPerson} but throws when there is no signed-in person.
 * Use in actions that cannot proceed anonymously.
 */
export async function requireActingPerson(message = "You must be signed in."): Promise<PersonDoc> {
  const person = await resolveActingPerson();
  if (!person) throw new Error(message);
  return person;
}
