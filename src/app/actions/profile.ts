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
import { findGravatarUrl } from "@/lib/gravatar";
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
  /** Avatar — an uploaded R2 URL, a Gravatar URL, or one of the preset
   *  sticker data: URIs. Anything the client resolved to a renderable image. */
  picture?: string;
  nickname?: string;
  preferredUsername?: string;
  phoneNumber?: string;
  gender?: string;
  /** ISO `YYYY-MM-DD`. */
  birthdate?: string;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

async function resolveActingWorkosUserId(): Promise<string | null> {
  if (isDevBypass()) return DEV_WORKOS_ID;
  const { user } = await withAuth();
  return user?.id ?? null;
}

export async function updateMyProfile(fields: ProfileFields): Promise<AppUser | null> {
  const workosUserId = await resolveActingWorkosUserId();
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
  if (typeof fields.picture === "string") set.picture = fields.picture;
  if (typeof fields.nickname === "string") set.nickname = fields.nickname.trim();
  if (typeof fields.preferredUsername === "string") {
    set.preferredUsername = fields.preferredUsername.trim();
  }
  if (typeof fields.phoneNumber === "string") set.phoneNumber = fields.phoneNumber.trim();
  if (typeof fields.gender === "string") set.gender = fields.gender.trim();
  // Only a well-formed calendar date reaches the store as a real Date.
  if (typeof fields.birthdate === "string" && ISO_DATE.test(fields.birthdate)) {
    set.birthdate = new Date(`${fields.birthdate}T00:00:00.000Z`);
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

/**
 * Look up a Gravatar for the signed-in person's own email. Returns null if
 * they have none set — the caller (the avatar picker) shows a "not found"
 * message rather than silently doing nothing.
 */
export async function getMyGravatarUrlAction(): Promise<string | null> {
  const workosUserId = await resolveActingWorkosUserId();
  if (!workosUserId) throw new Error("You must be signed in to look up a Gravatar.");

  const persons = await personsCollection();
  const doc = await persons.findOne({ workosUserId });
  if (!doc?.email) return null;
  return findGravatarUrl(doc.email);
}
