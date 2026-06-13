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
    // Not modeled on the v3.1 person doc — defaulted until they have a home.
    addressLocality: undefined,
    addressCountry: undefined,
    interests: [],
    // Role is an extra (validator-permitted) field set out-of-band on the
    // person doc; unknown/absent values fall back to plain "user".
    role: doc.role && KNOWN_ROLES.has(doc.role) ? (doc.role as AppUserRole) : "user",
    // Heuristic: a synced user with a name has cleared the minimum bar.
    onboardingCompleted: Boolean(doc.name),
    suspended: doc.isActive === false,
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
