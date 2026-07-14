/**
 * /settings — server component.
 *
 * Gated at super_admin (the old in-app page was client-only and relied on the
 * layout; the standalone app runs the server gate on every route). The
 * persisted `system.platformSettings` singleton is read server-side and
 * handed to the client form — no client-side settings fetch on mount.
 */

import { headers } from "next/headers";
import SettingsClient from "./settings-client";
import {
  getPlatformSettings,
  DEFAULT_PLATFORM_SETTINGS,
  type PlatformSettings,
} from "@/lib/mongo/settings";
import { requireAdmin } from "@admin/lib/require-admin";

export const dynamic = "force-dynamic";

export default async function AdminSettingsPage() {
  await requireAdmin("super_admin");
  void (await headers());

  let settings: PlatformSettings;
  let loadError = false;
  try {
    settings = await getPlatformSettings();
  } catch (err) {
    console.error("[mukoko] admin/settings: mongo read failed", err);
    settings = DEFAULT_PLATFORM_SETTINGS;
    loadError = true;
  }

  return <SettingsClient initialSettings={settings} loadError={loadError} />;
}
