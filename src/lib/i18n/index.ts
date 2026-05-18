/**
 * Lightweight i18n for nhimbe.
 * Supports English (en) and Shona (sn) — the two primary languages in Zimbabwe.
 *
 * Two consumption modes:
 *  1. React client components — use `useT()` from `./i18n-provider` for a
 *     reactive translator that re-renders when `setLocale()` is called.
 *  2. Non-React contexts (RSC, utility files, modules) — use the `t()`,
 *     `getLocale()`, `setLocale()` exports from this file. They read/write a
 *     module-level mirror plus localStorage when `window` is available.
 *
 * Both modes share the same translation table and the same persistence key.
 */

export type Locale = "en" | "sn";

export type TranslationVars = Record<string, string | number>;

type TranslationKey = string;
type TranslationMap = Record<TranslationKey, string>;

export const LOCALE_STORAGE_KEY = "nhimbe_locale";

const translations: Record<Locale, TranslationMap> = {
  en: {
    // Navigation
    "nav.home": "Home",
    "nav.events": "Events",
    "nav.search": "Search",
    "nav.myEvents": "My Events",
    "nav.profile": "Profile",
    "nav.signIn": "Sign In",
    "nav.signOut": "Sign Out",

    // Events
    "events.create": "Create Event",
    "events.register": "Register",
    "events.registered": "Registered",
    "events.cancelled": "Cancelled",
    "events.full": "Event Full",
    "events.joinWaitlist": "Join Waitlist",
    "events.share": "Share",
    "events.attendees": "attendees",
    "events.noEvents": "No events found",
    "events.trending": "Trending",
    "events.upcoming": "Upcoming Events",

    // Auth
    "auth.signIn": "Sign In",
    "auth.signOut": "Sign Out",
    "auth.welcome": "Welcome back",

    // Common
    "common.loading": "Loading...",
    "common.error": "Something went wrong",
    "common.retry": "Try again",
    "common.save": "Save",
    "common.cancel": "Cancel",
    "common.delete": "Delete",
    "common.edit": "Edit",
    "common.copied": "Copied!",
    "common.seeAll": "See All",

    // Brand
    "brand.tagline": "Together we gather, together we grow.",

    // Kraal (formerly known as circles)
    "kraal.title": "Kraal",
    "kraal.subtitle": "Where the gathering circle keeps the fire alive between events.",
    "kraal.viewKraal": "View kraal",
    "kraal.join": "Join kraal",
    "kraal.tabs.stream": "Stream",
    "kraal.tabs.members": "Members",
    "kraal.tabs.archive": "Archive",
    "kraal.compose.placeholder": "Share something with the kraal…",
    "kraal.empty": "No posts yet — be the first to spark the fire.",
  },
  sn: {
    // Navigation
    "nav.home": "Kumba",
    "nav.events": "Zviitiko",
    "nav.search": "Tsvaga",
    "nav.myEvents": "Zviitiko Zvangu",
    "nav.profile": "Pfupiso",
    "nav.signIn": "Pinda",
    "nav.signOut": "Buda",

    // Events
    "events.create": "Gadzira Chiitiko",
    "events.register": "Nyoresa",
    "events.registered": "Wanyoreswa",
    "events.cancelled": "Yakadzimwa",
    "events.full": "Chiitiko Chakazara",
    "events.joinWaitlist": "Pinda muRaini",
    "events.share": "Govera",
    "events.attendees": "vanopinda",
    "events.noEvents": "Hapana zviitiko zvawanikwa",
    "events.trending": "Zvinonyanya Kutaurwa",
    "events.upcoming": "Zviitiko Zvinouya",

    // Auth
    "auth.signIn": "Pinda",
    "auth.signOut": "Buda",
    "auth.welcome": "Mauya zvakare",

    // Common
    "common.loading": "Kuvhura...",
    "common.error": "Pane chakakanganisika",
    "common.retry": "Edza zvakare",
    "common.save": "Chengetedza",
    "common.cancel": "Kanzura",
    "common.delete": "Bvisa",
    "common.edit": "Shandura",
    "common.copied": "Yakopiswa!",
    "common.seeAll": "Ona Zvose",

    // Brand
    "brand.tagline": "Tose tinosangana, tose tinokura.",

    // Kraal
    "kraal.title": "Kraal",
    "kraal.subtitle": "Pekuchengetedza moto wedanho pakati pezviitiko.",
    "kraal.viewKraal": "Ona Kraal",
    "kraal.join": "Pinda muKraal",
    "kraal.tabs.stream": "Mhepo",
    "kraal.tabs.members": "Vagari",
    "kraal.tabs.archive": "Zvakachengetwa",
    "kraal.compose.placeholder": "Govera neKraal…",
    "kraal.empty": "Hapana zvakanyorwa — iva wekutanga kubatidza moto.",
  },
};

let currentLocale: Locale = "en";

/**
 * Interpolate `{name}` placeholders. Missing vars are left as-is so the
 * developer can spot them in the UI.
 */
function interpolate(template: string, vars?: TranslationVars): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, key: string) => {
    const value = vars[key];
    return value === undefined ? match : String(value);
  });
}

/**
 * Look up a translation for an explicit locale. Falls back to English, then
 * to the raw key. Pure — no side effects — so it's safe to call from the
 * provider's render path or from utility code.
 */
export function tStatic(locale: Locale, key: TranslationKey, vars?: TranslationVars): string {
  const raw = translations[locale]?.[key] ?? translations.en[key] ?? key;
  return interpolate(raw, vars);
}

export function setLocale(locale: Locale): void {
  currentLocale = locale;
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
    } catch {
      // localStorage may throw in private-mode or sandboxed iframes; ignore.
    }
  }
}

export function getLocale(): Locale {
  if (typeof window !== "undefined") {
    try {
      const stored = window.localStorage.getItem(LOCALE_STORAGE_KEY);
      if (stored === "en" || stored === "sn") {
        currentLocale = stored;
      }
    } catch {
      // ignore
    }
  }
  return currentLocale;
}

export function t(key: TranslationKey, vars?: TranslationVars): string {
  return tStatic(currentLocale, key, vars);
}

export function getAvailableLocales(): { code: Locale; name: string }[] {
  return [
    { code: "en", name: "English" },
    { code: "sn", name: "Shona" },
  ];
}

export { I18nProvider, useT } from "./i18n-provider";
