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
import { mapPersonToAppUser, type AppUser, type AppLocale } from "@/lib/mongo/users";
import { isDevBypass, DEV_WORKOS_ID } from "@/lib/auth/dev";
import { log } from "@/lib/observability";

const KNOWN_LOCALES: ReadonlySet<string> = new Set(["en", "sn"]);

export interface ProfileFields {
  name?: string;
  addressLocality?: string;
  addressCountry?: string;
  interests?: string[];
  /** Event-update notifications (opt-out preference; stored under
   *  `mukoko.notifications.eventUpdates` on the person doc). */
  subscribeToEventUpdates?: boolean;
  /** Preferred UI language — persisted to the OIDC `locale` field so the
   *  choice follows the person across devices. Ignored if not "en"/"sn". */
  locale?: AppLocale;
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
  // Only persist a language we actually ship — never write an arbitrary value
  // into the OIDC `locale` field.
  if (typeof fields.locale === "string" && KNOWN_LOCALES.has(fields.locale)) {
    set.locale = fields.locale;
  }

  const persons = await personsCollection();
  const doc = await persons.findOneAndUpdate(
    { workosUserId },
    { $set: set },
    { returnDocument: "after" },
  );
  if (!doc) throw new Error("Could not resolve your account.");
  log.info("profile updated", {
    module: "profile",
    data: { fields: Object.keys(set).filter((k) => k !== "updatedAt") },
  });
  return mapPersonToAppUser(doc);
}
