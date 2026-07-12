"use server";

/**
 * Admin platform-settings server actions (Vercel server runtime → MongoDB).
 *
 * Replaces the admin settings screen's stubbed `setTimeout` "save" — which
 * faked success and persisted nothing — with a real read/write against the
 * `system.platformSettings` singleton. Both actions are admin-gated via
 * `requireAdmin`, so a non-admin caller is bounced before any read/write.
 */

import { requireAdmin } from "@/app/admin/require-admin";
import {
  getPlatformSettings,
  savePlatformSettings,
  type PlatformSettings,
} from "@/lib/mongo/settings";

export type { PlatformSettings };

export async function getPlatformSettingsAction(): Promise<PlatformSettings> {
  await requireAdmin();
  return getPlatformSettings();
}

export async function savePlatformSettingsAction(
  patch: Partial<PlatformSettings>,
): Promise<PlatformSettings> {
  await requireAdmin();
  return savePlatformSettings(patch);
}
