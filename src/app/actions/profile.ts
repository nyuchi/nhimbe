"use server";

/**
 * Profile update server action (Vercel server runtime → MongoDB).
 *
 * Replaces the old browser-side Supabase `updatePersonProfile`. The signed-in
 * person is resolved via AuthKit (or dev bypass), then their profile fields are
 * written to `identity.persons`. name maps to the canonical field; locality /
 * country / interests are nhimbe profile extras the validator permits.
 */

import { withAuth } from "@workos-inc/authkit-nextjs";
import { personsCollection } from "@/lib/mongo/databases";
import { mapPersonToAppUser, type AppUser } from "@/lib/mongo/users";
import { isDevBypass, DEV_WORKOS_ID } from "@/lib/auth/dev";

export interface ProfileFields {
  name?: string;
  addressLocality?: string;
  addressCountry?: string;
  interests?: string[];
  /** Event-update notifications (opt-out preference; stored under
   *  `mukoko.notifications.eventUpdates` on the person doc). */
  subscribeToEventUpdates?: boolean;
}

export async function updateMyProfile(fields: ProfileFields): Promise<AppUser | null> {
  let workosUserId: string | null = null;
  if (isDevBypass()) {
    workosUserId = DEV_WORKOS_ID;
  } else {
    const { user } = await withAuth();
    workosUserId = user?.id ?? null;
  }
  if (!workosUserId) throw new Error("You must be signed in to update your profile.");

  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (typeof fields.name === "string") set.name = fields.name.trim();
  if (typeof fields.addressLocality === "string") set.addressLocality = fields.addressLocality.trim();
  if (typeof fields.addressCountry === "string") set.addressCountry = fields.addressCountry.trim();
  if (Array.isArray(fields.interests)) set.interests = fields.interests;
  if (typeof fields.subscribeToEventUpdates === "boolean") {
    set["mukoko.notifications.eventUpdates"] = fields.subscribeToEventUpdates;
  }

  const persons = await personsCollection();
  const doc = await persons.findOneAndUpdate(
    { workosUserId },
    { $set: set },
    { returnDocument: "after" },
  );
  if (!doc) throw new Error("Could not resolve your account.");
  return mapPersonToAppUser(doc);
}
