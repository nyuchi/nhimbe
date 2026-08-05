import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const platformSettings = { findOne: vi.fn(), updateOne: vi.fn() };

vi.mock("@/lib/mongo/databases", () => ({
  DB: { system: "system" },
  getCollection: vi.fn(async () => platformSettings),
}));

import {
  DEFAULT_PLATFORM_SETTINGS,
  PLATFORM_SETTINGS_ID,
  normalizePlatformSettings,
  getPlatformSettings,
  savePlatformSettings,
} from "./settings";

beforeEach(() => {
  vi.clearAllMocks();
  platformSettings.findOne.mockResolvedValue(null);
  platformSettings.updateOne.mockResolvedValue({ acknowledged: true });
});

describe("normalizePlatformSettings", () => {
  it("returns the defaults for null/undefined", () => {
    expect(normalizePlatformSettings(null)).toEqual(DEFAULT_PLATFORM_SETTINGS);
    expect(normalizePlatformSettings(undefined)).toEqual(DEFAULT_PLATFORM_SETTINGS);
  });

  it("clamps negative and non-finite numbers back to the default", () => {
    const out = normalizePlatformSettings({ maxEventsPerUser: -5, maxAttendeesDefault: Number.NaN });
    expect(out.maxEventsPerUser).toBe(DEFAULT_PLATFORM_SETTINGS.maxEventsPerUser);
    expect(out.maxAttendeesDefault).toBe(DEFAULT_PLATFORM_SETTINGS.maxAttendeesDefault);
  });

  it("clamps the free-plan blast cap the same way, and allows 0 (unlimited)", () => {
    const out = normalizePlatformSettings({ freeBlastsPerDayPerEvent: -1 });
    expect(out.freeBlastsPerDayPerEvent).toBe(DEFAULT_PLATFORM_SETTINGS.freeBlastsPerDayPerEvent);
    expect(normalizePlatformSettings({ freeBlastsPerDayPerEvent: 0 }).freeBlastsPerDayPerEvent).toBe(0);
  });

  it("floors fractional numbers", () => {
    expect(normalizePlatformSettings({ maxEventsPerUser: 12.9 }).maxEventsPerUser).toBe(12);
  });

  it("coerces wrong-typed values to defaults", () => {
    const out = normalizePlatformSettings({
      // @ts-expect-error — exercising untrusted input
      maintenanceMode: "yes",
      // @ts-expect-error — exercising untrusted input
      siteName: 123,
    });
    expect(out.maintenanceMode).toBe(DEFAULT_PLATFORM_SETTINGS.maintenanceMode);
    expect(out.siteName).toBe(DEFAULT_PLATFORM_SETTINGS.siteName);
  });

  it("trims strings and falls back to the default site name when blank", () => {
    const out = normalizePlatformSettings({ siteName: "   ", allowedDomains: "  a.com, b.org " });
    expect(out.siteName).toBe(DEFAULT_PLATFORM_SETTINGS.siteName);
    expect(out.allowedDomains).toBe("a.com, b.org");
  });

  it("passes valid values through", () => {
    const valid = { ...DEFAULT_PLATFORM_SETTINGS, siteName: "Mukoko Events", maintenanceMode: true };
    expect(normalizePlatformSettings(valid)).toEqual(valid);
  });
});

describe("getPlatformSettings", () => {
  it("reads the singleton and normalizes it", async () => {
    platformSettings.findOne.mockResolvedValueOnce({
      _id: PLATFORM_SETTINGS_ID,
      siteName: "Custom",
      maxEventsPerUser: -1,
    });
    const out = await getPlatformSettings();
    expect(platformSettings.findOne).toHaveBeenCalledWith({ _id: PLATFORM_SETTINGS_ID });
    expect(out.siteName).toBe("Custom");
    expect(out.maxEventsPerUser).toBe(DEFAULT_PLATFORM_SETTINGS.maxEventsPerUser);
  });

  it("returns defaults when nothing is persisted", async () => {
    expect(await getPlatformSettings()).toEqual(DEFAULT_PLATFORM_SETTINGS);
  });
});

describe("savePlatformSettings", () => {
  it("upserts the singleton and returns the normalized merge", async () => {
    const result = await savePlatformSettings({ maintenanceMode: true, maxEventsPerUser: 10 });

    expect(platformSettings.updateOne).toHaveBeenCalledTimes(1);
    const [filter, update, opts] = platformSettings.updateOne.mock.calls[0];
    expect(filter).toEqual({ _id: PLATFORM_SETTINGS_ID });
    expect(opts).toEqual({ upsert: true });
    expect(update.$set.maintenanceMode).toBe(true);
    expect(update.$set.maxEventsPerUser).toBe(10);
    expect(update.$set.updatedAt).toBeInstanceOf(Date);
    expect(update.$setOnInsert._schemaVersion).toBe("v3.1");
    expect(result.maintenanceMode).toBe(true);
  });
});
