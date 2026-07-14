"use server";

/**
 * Platform-settings server actions — reads/writes the
 * `system.platformSettings` singleton via the shared mongo module.
 *
 * Gated at super_admin end-to-end, matching the Settings nav item's declared
 * requirement (the old in-app page only locked the nav at super_admin while
 * the actions gated at admin — the standalone app makes the two consistent).
 */

import { requireAdmin } from "@admin/lib/require-admin";
import {
  getPlatformSettings,
  savePlatformSettings,
  type PlatformSettings,
} from "@/lib/mongo/settings";

export type { PlatformSettings };

export async function getPlatformSettingsAction(): Promise<PlatformSettings> {
  await requireAdmin("super_admin");
  return getPlatformSettings();
}

export async function savePlatformSettingsAction(
  patch: Partial<PlatformSettings>,
): Promise<PlatformSettings> {
  await requireAdmin("super_admin");
  return savePlatformSettings(patch);
}
