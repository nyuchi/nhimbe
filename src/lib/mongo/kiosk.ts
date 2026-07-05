/**
 * Kiosk pairing + signage session model (Vercel server runtime → MongoDB).
 *
 * Replaces the retired worker's `/api/kiosk/*` endpoints. A TV-style kiosk or
 * signage screen shows a short pairing CODE; a host enters that code on their
 * phone to bind the screen to one of their events. Once confirmed, the pairing
 * document's `_id` doubles as the opaque SESSION TOKEN the screen presents on
 * subsequent reads and check-ins.
 *
 * Storage lives in `device.pairings` (see `PairingDoc`). That validator only
 * permits { code, status, expiresAt, eventId?, entityId?, pairedPersonId? }, so
 * we deliberately DON'T persist a `screenType` — no reader branches on it, and
 * sessions default to "kiosk" in the API shape. The single `expiresAt` field is
 * reused for both the short pre-pairing window and the longer confirmed-session
 * TTL (extended on confirm so an all-day kiosk doesn't die after 15 minutes).
 */

import "server-only";
import {
  checkInsCollection,
  eventsCollection,
  pairingsCollection,
  rsvpsCollection,
} from "./databases";
import { newId, stampNew } from "./ids";
import { listHostEntitiesForPerson } from "./entities";
import type { CheckInDoc, PairingDoc } from "./types";
import type { KioskPairingStatus, KioskSession, ScreenType } from "@/lib/api";

/** How long a freshly-issued pairing code stays valid before it must be regenerated. */
const PAIRING_TTL_MS = 15 * 60 * 1000; // 15 minutes
/** How long a confirmed kiosk/signage session lives (covers a full event day). */
const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

/** Unambiguous uppercase alphabet (no 0/O/1/I) for hand-typed pairing codes. */
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 6;

function generatePairingCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(CODE_LENGTH));
  let out = "";
  for (let i = 0; i < CODE_LENGTH; i++) out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  return out;
}

/**
 * Issue a fresh pairing code for a kiosk/signage screen. Inserts a pending
 * pairing that expires in 15 minutes. `screenType` is echoed back for the
 * caller but not persisted (the validator doesn't carry it).
 */
export async function requestKioskPairing(
  screenType: ScreenType = "kiosk",
): Promise<{ code: string; expiresIn: number; screenType: ScreenType }> {
  const pairings = await pairingsCollection();
  const now = Date.now();

  // Avoid colliding with a still-live pending code. Best-effort — a final
  // fallthrough always yields a code even in the astronomically unlikely case
  // every attempt clashed.
  let code = generatePairingCode();
  for (let attempt = 0; attempt < 5; attempt++) {
    const clash = await pairings.findOne({
      code,
      status: "pending",
      expiresAt: { $gt: new Date(now) },
    });
    if (!clash) break;
    code = generatePairingCode();
  }

  await pairings.insertOne({
    ...stampNew(newId()),
    code,
    status: "pending",
    expiresAt: new Date(now + PAIRING_TTL_MS),
    eventId: null,
  } as PairingDoc);

  return { code, expiresIn: Math.floor(PAIRING_TTL_MS / 1000), screenType };
}

/**
 * Poll a pairing code's status. Returns `expired` when the code is unknown or
 * past its window, `confirmed` (with the bound event + session token) once a
 * host has paired it, otherwise `pending`.
 */
export async function getKioskPairingStatus(code: string): Promise<KioskPairingStatus> {
  const pairings = await pairingsCollection();
  const pairing = await pairings.findOne({ code });

  if (!pairing) return { status: "expired" };
  if (pairing.expiresAt.getTime() < Date.now()) return { status: "expired" };

  if (pairing.status === "confirmed" && pairing.eventId) {
    const events = await eventsCollection();
    const event = await events.findOne({ _id: pairing.eventId });
    return {
      status: "confirmed",
      eventId: pairing.eventId,
      eventName: event?.name ?? "Event",
      sessionToken: pairing._id,
    };
  }

  return { status: "pending" };
}

/**
 * Host confirms a pairing code, binding the screen to one of their events.
 * HOST-GATED: `personId` must hold a hosting-capable membership on the event's
 * `primaryHostEntityId`. On success the pairing is marked confirmed and its
 * expiry is extended to the full session TTL; the pairing `_id` is returned as
 * the session token.
 */
export async function confirmKioskPairing(
  code: string,
  eventId: string,
  personId: string,
): Promise<{ message: string; eventName: string; screenType: ScreenType; sessionToken: string }> {
  const pairings = await pairingsCollection();
  const pairing = await pairings.findOne({ code });

  if (!pairing) throw new Error("That pairing code was not found.");
  if (pairing.expiresAt.getTime() < Date.now()) {
    throw new Error("That pairing code has expired. Generate a new one on the kiosk.");
  }
  if (pairing.status === "confirmed") {
    throw new Error("That pairing code has already been used.");
  }

  const events = await eventsCollection();
  const event = await events.findOne({ _id: eventId });
  if (!event) throw new Error("That event could not be found.");

  // Entity-centric host check (Rule 10): the acting person must host through
  // the entity that owns this event.
  const hostEntities = await listHostEntitiesForPerson(personId);
  const canHost = hostEntities.some((e) => e._id === event.primaryHostEntityId);
  if (!canHost) throw new Error("You are not a host of this event.");

  await pairings.updateOne(
    { _id: pairing._id },
    {
      $set: {
        status: "confirmed",
        eventId,
        pairedPersonId: personId,
        expiresAt: new Date(Date.now() + SESSION_TTL_MS),
        updatedAt: new Date(),
      },
    },
  );

  return {
    message: "Kiosk paired successfully.",
    eventName: event.name,
    screenType: "kiosk",
    sessionToken: pairing._id,
  };
}

/**
 * Resolve a confirmed kiosk/signage session from its token (the pairing `_id`).
 * Throws when the token is unknown, unconfirmed, expired, or its event is gone.
 */
export async function getKioskSession(token: string): Promise<{ session: KioskSession }> {
  const pairings = await pairingsCollection();
  const pairing = await pairings.findOne({ _id: token, status: "confirmed" });

  if (!pairing) throw new Error("Kiosk session not found.");
  if (pairing.expiresAt.getTime() < Date.now()) throw new Error("Kiosk session has expired.");
  if (!pairing.eventId) throw new Error("Kiosk session is not bound to an event.");

  const events = await eventsCollection();
  const event = await events.findOne({ _id: pairing.eventId });
  if (!event) throw new Error("Event not found for this kiosk session.");

  return {
    session: {
      eventId: pairing.eventId,
      eventName: event.name,
      screenType: "kiosk",
      hostId: pairing.pairedPersonId ?? null,
      pairedAt: pairing.updatedAt.toISOString(),
    },
  };
}

/**
 * Deactivate a kiosk/signage session. Flips it out of the confirmed state and
 * expires it so neither `getKioskSession` nor `getKioskPairingStatus` will honor
 * the token again.
 */
export async function endKioskSession(token: string): Promise<{ message: string }> {
  const pairings = await pairingsCollection();
  await pairings.updateOne(
    { _id: token },
    { $set: { status: "expired", expiresAt: new Date(0), updatedAt: new Date() } },
  );
  return { message: "Kiosk session ended." };
}

/**
 * Record a check-in initiated from a paired kiosk. Validates the session token
 * is confirmed and bound to `eventId`, resolves the RSVP's attendee, and writes
 * an `events.checkIns` row (once). Throws "Registration not found" / "Already
 * checked in" so the kiosk UI can classify the outcome.
 */
export async function checkinViaKiosk(
  eventId: string,
  registrationId: string,
  token: string,
): Promise<{ message: string; registrationId: string; eventId: string }> {
  const pairings = await pairingsCollection();
  const pairing = await pairings.findOne({ _id: token, status: "confirmed" });

  if (!pairing) throw new Error("Kiosk session not found.");
  if (pairing.expiresAt.getTime() < Date.now()) throw new Error("Kiosk session has expired.");
  if (pairing.eventId !== eventId) throw new Error("Kiosk session is not bound to this event.");

  const rsvps = await rsvpsCollection();
  const rsvp = await rsvps.findOne({ _id: registrationId, eventId });
  if (!rsvp) throw new Error("Registration not found");

  const checkIns = await checkInsCollection();
  const existing = await checkIns.findOne({ eventId, attendeePersonId: rsvp.attendeePersonId });
  if (existing) throw new Error("Already checked in");

  await checkIns.insertOne({
    ...stampNew(newId()),
    eventId,
    attendeePersonId: rsvp.attendeePersonId,
    checkInMethod: "qr_code",
    checkedInAt: new Date(),
    checkedInByPersonId: pairing.pairedPersonId ?? null,
    ticketId: null,
    location: null,
  } as CheckInDoc);

  return { message: "Checked in successfully.", registrationId, eventId };
}
