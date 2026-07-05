"use server";

/**
 * Kiosk pairing + signage session server actions (Vercel server runtime →
 * MongoDB). These replace the retired worker's `/api/kiosk/*` REST calls that
 * the kiosk/signage pages previously hit through `@/lib/api`.
 *
 * All reads run straight against `device.pairings` via `@/lib/mongo/kiosk`.
 * Only `confirmKioskPairingAction` is authenticated: pairing a screen to an
 * event is host-gated, so we resolve the acting person (WorkOS session or the
 * local dev bypass) and hand their id to the model for the entity-host check.
 * The polling/status reads are intentionally open — a kiosk screen has no
 * session of its own until a host confirms it.
 */

import { withAuth } from "@workos-inc/authkit-nextjs";
import { personsCollection } from "@/lib/mongo/databases";
import { syncPersonFromWorkos, type SyncPersonInput } from "@/lib/mongo/users";
import { isDevBypass, DEV_WORKOS_ID, DEV_EMAIL, DEV_NAME } from "@/lib/auth/dev";
import {
  requestKioskPairing,
  getKioskPairingStatus,
  confirmKioskPairing,
  getKioskSession,
  endKioskSession,
  checkinViaKiosk,
} from "@/lib/mongo/kiosk";
import type { PersonDoc } from "@/lib/mongo/types";
import type { KioskPairingStatus, KioskSession, ScreenType } from "@/lib/api";

/** Resolve the acting person doc (WorkOS session or dev bypass), syncing if new. */
async function resolveActingPerson(): Promise<PersonDoc> {
  let syncInput: SyncPersonInput;
  if (isDevBypass()) {
    syncInput = { workosUserId: DEV_WORKOS_ID, email: DEV_EMAIL, name: DEV_NAME, emailVerified: true };
  } else {
    const { user } = await withAuth();
    if (!user) throw new Error("You must be signed in to pair a kiosk.");
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
  if (!person) throw new Error("Could not resolve your account. Please try again.");
  return person;
}

/** Issue a fresh pairing code for a kiosk/signage screen. */
export async function requestKioskPairingAction(
  screenType: ScreenType = "kiosk",
): Promise<{ code: string; expiresIn: number; screenType: ScreenType }> {
  return requestKioskPairing(screenType);
}

/** Poll a pairing code's status (open — the screen has no session yet). */
export async function getKioskPairingStatusAction(code: string): Promise<KioskPairingStatus> {
  return getKioskPairingStatus(code);
}

/** Host confirms a pairing code, binding the screen to one of their events. */
export async function confirmKioskPairingAction(
  code: string,
  eventId: string,
): Promise<{ message: string; eventName: string; screenType: ScreenType; sessionToken: string }> {
  const person = await resolveActingPerson();
  return confirmKioskPairing(code, eventId, person._id);
}

/** Resolve a confirmed kiosk/signage session from its token. */
export async function getKioskSessionAction(token: string): Promise<{ session: KioskSession }> {
  return getKioskSession(token);
}

/** Deactivate a kiosk/signage session. */
export async function endKioskSessionAction(token: string): Promise<{ message: string }> {
  return endKioskSession(token);
}

/** Record a check-in initiated from a paired kiosk. */
export async function checkinViaKioskAction(
  eventId: string,
  registrationId: string,
  token: string,
): Promise<{ message: string; registrationId: string; eventId: string }> {
  return checkinViaKiosk(eventId, registrationId, token);
}
