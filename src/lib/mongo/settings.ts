/**
 * Platform settings — a single app-owned config document.
 *
 * The admin settings screen edits a small bag of platform toggles/limits. They
 * live as one singleton document in `system.platformSettings` (fixed `_id`), so
 * a read is a point lookup and a save is an upsert. This is nhimbe-owned config
 * (not a shared Mukoko substrate), so the shape is defined here.
 *
 * Server-only: pulls the Mongo collection accessors.
 */

import "server-only";
import { getCollection, DB } from "./databases";
import { WRITE_SCHEMA_VERSION } from "./ids";
import type { BaseDoc } from "./types";

/** Fixed primary key for the singleton settings document. */
export const PLATFORM_SETTINGS_ID = "platform";

export interface PlatformSettings {
  siteName: string;
  supportEmail: string;
  maxEventsPerUser: number;
  maxAttendeesDefault: number;
  requireEmailVerification: boolean;
  enableRegistrations: boolean;
  enableReviews: boolean;
  enableReferrals: boolean;
  maintenanceMode: boolean;
  /** Comma-separated allow-list of email domains; empty = allow all. */
  allowedDomains: string;
}

interface PlatformSettingsDoc extends BaseDoc, PlatformSettings {}

const platformSettingsCollection = () =>
  getCollection<PlatformSettingsDoc>(DB.system, "platformSettings");

export const DEFAULT_PLATFORM_SETTINGS: PlatformSettings = {
  siteName: "nhimbe",
  supportEmail: "support@nhimbe.com",
  maxEventsPerUser: 50,
  maxAttendeesDefault: 100,
  requireEmailVerification: true,
  enableRegistrations: true,
  enableReviews: true,
  enableReferrals: true,
  maintenanceMode: false,
  allowedDomains: "",
};

/** Coerce/clamp a partial, possibly-untrusted settings bag onto the defaults. */
export function normalizePlatformSettings(raw: Partial<PlatformSettings> | null | undefined): PlatformSettings {
  const d = DEFAULT_PLATFORM_SETTINGS;
  const r = raw ?? {};
  const str = (v: unknown, fallback: string) => (typeof v === "string" ? v : fallback);
  const bool = (v: unknown, fallback: boolean) => (typeof v === "boolean" ? v : fallback);
  const nonNegInt = (v: unknown, fallback: number) =>
    typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.floor(v) : fallback;

  return {
    siteName: str(r.siteName, d.siteName).trim() || d.siteName,
    supportEmail: str(r.supportEmail, d.supportEmail).trim(),
    maxEventsPerUser: nonNegInt(r.maxEventsPerUser, d.maxEventsPerUser),
    maxAttendeesDefault: nonNegInt(r.maxAttendeesDefault, d.maxAttendeesDefault),
    requireEmailVerification: bool(r.requireEmailVerification, d.requireEmailVerification),
    enableRegistrations: bool(r.enableRegistrations, d.enableRegistrations),
    enableReviews: bool(r.enableReviews, d.enableReviews),
    enableReferrals: bool(r.enableReferrals, d.enableReferrals),
    maintenanceMode: bool(r.maintenanceMode, d.maintenanceMode),
    allowedDomains: str(r.allowedDomains, d.allowedDomains).trim(),
  };
}

/** Read the platform settings, falling back to defaults when unset. */
export async function getPlatformSettings(): Promise<PlatformSettings> {
  const col = await platformSettingsCollection();
  const doc = await col.findOne({ _id: PLATFORM_SETTINGS_ID });
  return normalizePlatformSettings(doc);
}

/** Upsert the platform settings singleton and return the persisted values. */
export async function savePlatformSettings(patch: Partial<PlatformSettings>): Promise<PlatformSettings> {
  const next = normalizePlatformSettings({ ...(await getPlatformSettings()), ...patch });
  const now = new Date();
  const col = await platformSettingsCollection();
  await col.updateOne(
    { _id: PLATFORM_SETTINGS_ID },
    {
      $set: { ...next, updatedAt: now },
      $setOnInsert: { _id: PLATFORM_SETTINGS_ID, _schemaVersion: WRITE_SCHEMA_VERSION, createdAt: now },
    },
    { upsert: true },
  );
  return next;
}
