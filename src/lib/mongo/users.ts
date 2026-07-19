/**
 * Server-side user identity: sync the signed-in WorkOS user into
 * `identity.persons` and read people back in the app's user shape.
 *
 * Auth is 100% WorkOS: the signed-in session is resolved server-side via
 * AuthKit (`withAuth()`), and this module mirrors that user into the canonical
 * `identity.persons` collection (keyed on `workosUserId`). The browser never
 * connects to Mongo — this runs only in Server Actions / Route Handlers.
 *
 * Schema gaps to be aware of (the v3.1 `persons` schema is owned by the
 * platform, not nhimbe):
 *  - There is NO `role` field on persons — we default every user to "user".
 *    Admin/moderator RBAC must map to a platform role field or entity
 *    membership; that's a platform-schema decision, tracked as follow-up.
 *  - `interests`, `address`, and an onboarding flag are not on the person doc
 *    (they lived on the legacy identity.person). They're defaulted here until
 *    they have a home in the new model.
 *  - `suspended` is derived from `isActive === false`.
 */

import "server-only";
import { personsCollection } from "./databases";
import { newId, WRITE_SCHEMA_VERSION } from "./ids";
import type { PersonDoc } from "./types";

export type AppUserRole = "user" | "moderator" | "admin" | "super_admin";

/** The app/UI user shape derived from a `identity.persons` document. */
export interface AppUser {
  id: string;
  personId: string;
  workosUserId: string;
  email: string;
  name: string;
  image?: string;
  addressLocality?: string;
  addressCountry?: string;
  interests: string[];
  role: AppUserRole;
  onboardingCompleted: boolean;
  suspended: boolean;
  /** Event-update notifications (opt-out; absent on the doc means ON). */
  subscribedToEventUpdates?: boolean;
}

const KNOWN_ROLES: ReadonlySet<string> = new Set(["user", "moderator", "admin", "super_admin"]);

export function mapPersonToAppUser(doc: PersonDoc): AppUser {
  return {
    id: doc._id,
    personId: doc._id,
    workosUserId: doc.workosUserId ?? "",
    email: doc.email ?? "",
    name: doc.name ?? "",
    image: doc.picture ?? undefined,
    // nhimbe profile extras, stored on the person doc as permitted extras.
    addressLocality: doc.addressLocality ?? undefined,
    addressCountry: doc.addressCountry ?? undefined,
    interests: doc.interests ?? [],
    // Role is an extra (validator-permitted) field set out-of-band on the
    // person doc; unknown/absent values fall back to plain "user".
    role: doc.role && KNOWN_ROLES.has(doc.role) ? (doc.role as AppUserRole) : "user",
    // Heuristic: a synced user with a name has cleared the minimum bar.
    onboardingCompleted: Boolean(doc.name),
    suspended: doc.isActive === false,
    // Opt-out preference: only an explicit false means unsubscribed.
    subscribedToEventUpdates: doc.mukoko?.notifications?.eventUpdates !== false,
  };
}

export interface SyncPersonInput {
  workosUserId: string;
  email: string | null;
  name: string | null;
  givenName?: string | null;
  familyName?: string | null;
  picture?: string | null;
  emailVerified?: boolean;
}

/**
 * Structural view of a WorkOS user record — satisfied both by the AuthKit
 * session `User` (`@workos-inc/authkit-nextjs`) and by the webhook event
 * `User` (`@workos-inc/node`), so every provisioning surface (callback
 * `onSuccess`, webhook, lazy sync) maps the same way.
 */
export interface WorkosUserLike {
  id: string;
  email?: string | null;
  /** Full name — present on webhook users, absent from session users. */
  name?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  profilePictureUrl?: string | null;
  emailVerified?: boolean;
}

/** Map a WorkOS user record onto the person-sync input. Pure. */
export function syncInputFromWorkosUser(user: WorkosUserLike): SyncPersonInput {
  const joined = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
  return {
    workosUserId: user.id,
    email: user.email ?? null,
    name: user.name?.trim() || joined || null,
    givenName: user.firstName ?? null,
    familyName: user.lastName ?? null,
    picture: user.profilePictureUrl ?? null,
    emailVerified: typeof user.emailVerified === "boolean" ? user.emailVerified : undefined,
  };
}

/**
 * Upsert the signed-in WorkOS user into `identity.persons`, keyed on
 * `workosUserId`. Returns the resulting person in the app user shape. Idempotent
 * — safe to call on every sign-in / refresh.
 */
export async function syncPersonFromWorkos(input: SyncPersonInput): Promise<AppUser> {
  const col = await personsCollection();
  const now = new Date();

  const doc = await col.findOneAndUpdate(
    { workosUserId: input.workosUserId },
    {
      $set: {
        email: input.email,
        name: input.name,
        givenName: input.givenName ?? null,
        familyName: input.familyName ?? null,
        picture: input.picture ?? null,
        // Only write emailVerified when the claim is actually present — a
        // momentarily-missing claim must not regress a verified user to false.
        ...(typeof input.emailVerified === "boolean"
          ? { emailVerified: input.emailVerified }
          : {}),
        lastSeenAt: now,
        updatedAt: now,
      },
      $setOnInsert: {
        _id: newId(),
        _schemaVersion: WRITE_SCHEMA_VERSION,
        // workosUserId is supplied by the filter on insert.
        // emailVerified is required by the validator — default new docs only.
        ...(typeof input.emailVerified === "boolean" ? {} : { emailVerified: false }),
        isActive: true,
        phoneNumberVerified: false,
        createdAt: now,
      },
    },
    { upsert: true, returnDocument: "after" },
  );

  if (!doc) throw new Error("[mukoko] identity.persons upsert returned null");
  return mapPersonToAppUser(doc);
}

/**
 * Ensure a person document exists for a WorkOS user id WITHOUT touching any
 * profile fields on an existing doc — `$setOnInsert` only. Used by the
 * organization-membership webhook mirror, which knows only the WorkOS user id:
 * if the `user.created` event hasn't landed yet this creates a minimal,
 * validator-complete stub that the full sync enriches later; if the person
 * already exists nothing is overwritten. Idempotent.
 */
export async function ensurePersonForWorkosId(workosUserId: string): Promise<PersonDoc> {
  const col = await personsCollection();
  const now = new Date();
  const doc = await col.findOneAndUpdate(
    { workosUserId },
    {
      $setOnInsert: {
        _id: newId(),
        _schemaVersion: WRITE_SCHEMA_VERSION,
        // workosUserId is supplied by the filter on insert.
        email: null,
        name: null,
        emailVerified: false,
        phoneNumberVerified: false,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      },
    },
    { upsert: true, returnDocument: "after" },
  );
  if (!doc) throw new Error("[mukoko] identity.persons ensure returned null");
  return doc;
}

/**
 * Soft-deactivate a person when WorkOS reports `user.deleted`. Flips
 * `isActive` to false (the app derives `suspended` from it) — never a hard
 * delete, and never an upsert (deleting an unknown user must not create a
 * doc). Returns whether a person was matched.
 */
export async function deactivatePersonByWorkosId(workosUserId: string): Promise<boolean> {
  const col = await personsCollection();
  const result = await col.updateOne(
    { workosUserId },
    { $set: { isActive: false, updatedAt: new Date() } },
  );
  return result.matchedCount > 0;
}

/** Look up a person by their WorkOS user id. */
export async function getPersonByWorkosId(workosUserId: string): Promise<AppUser | null> {
  const col = await personsCollection();
  const doc = await col.findOne({ workosUserId });
  return doc ? mapPersonToAppUser(doc) : null;
}

/** Look up a person by their `identity.persons._id` (the OIDC `sub`). */
export async function getPersonById(personId: string): Promise<AppUser | null> {
  const col = await personsCollection();
  const doc = await col.findOne({ _id: personId });
  return doc ? mapPersonToAppUser(doc) : null;
}
