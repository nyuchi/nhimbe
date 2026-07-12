/**
 * Tests for the lightweight i18n core.
 *
 * Covers the pure `tStatic` lookup (locale resolution, English fallback, raw-key
 * fallback, `{var}` interpolation), the module-level `t`/`getLocale`/`setLocale`
 * mirror, and the available-locale list. The React provider is exercised
 * elsewhere; here we test the non-React exports.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  tStatic,
  t,
  setLocale,
  getLocale,
  getAvailableLocales,
  LOCALE_STORAGE_KEY,
} from "./index";

beforeEach(() => {
  // Reset to the default locale between tests (the setup file mocks
  // localStorage.getItem to return null, so getLocale won't override this).
  setLocale("en");
});

describe("tStatic", () => {
  it("returns the string for an explicit locale", () => {
    expect(tStatic("en", "nav.home")).toBe("Home");
    expect(tStatic("sn", "nav.home")).toBe("Kumba");
  });

  it("falls back to English when the key is missing in the target locale", () => {
    // "brand.tagline" exists in both; assert English is used as the fallback
    // source by looking up a locale that lacks a key. All sn keys currently
    // mirror en, so we prove the fallback path via an unknown locale cast.
    const unknownLocale = "xx" as unknown as "en";
    expect(tStatic(unknownLocale, "nav.events")).toBe("Events");
  });

  it("falls back to the raw key when it exists in no locale", () => {
    expect(tStatic("en", "totally.unknown.key")).toBe("totally.unknown.key");
  });

  it("interpolates {var} placeholders", () => {
    expect(tStatic("en", "common.copied", { count: 3 })).toBe("Copied!");
    // Use a key-independent template check via a synthetic vars map on a real
    // template that contains no placeholder — interpolation must be a no-op.
    expect(tStatic("en", "nav.home", { unused: "x" })).toBe("Home");
  });

  it("leaves unknown placeholders intact and stringifies provided values", () => {
    // tStatic falls back to the raw key when unknown, so a key that is itself a
    // template exercises interpolation directly.
    expect(tStatic("en", "Hello {name}, you have {n} messages", { name: "Ada", n: 2 })).toBe(
      "Hello Ada, you have 2 messages",
    );
    expect(tStatic("en", "Missing {who} here", {})).toBe("Missing {who} here");
  });
});

describe("t / getLocale / setLocale", () => {
  it("defaults to English", () => {
    expect(getLocale()).toBe("en");
    expect(t("nav.search")).toBe("Search");
  });

  it("switches the active locale for subsequent t() calls", () => {
    setLocale("sn");
    expect(getLocale()).toBe("sn");
    expect(t("nav.search")).toBe("Tsvaga");
  });

  it("exposes a stable localStorage key", () => {
    expect(LOCALE_STORAGE_KEY).toBe("nhimbe_locale");
  });
});

describe("getAvailableLocales", () => {
  it("lists English and Shona with display names", () => {
    expect(getAvailableLocales()).toEqual([
      { code: "en", name: "English" },
      { code: "sn", name: "Shona" },
    ]);
  });
});
