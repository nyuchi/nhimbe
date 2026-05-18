"use client";

/**
 * React-reactive i18n provider for nhimbe.
 *
 * The module-level `t()` / `getLocale()` / `setLocale()` exports in
 * `./index.ts` are intentionally kept for non-React contexts (RSC, utility
 * files, plain modules). Anything that lives in a `"use client"` component
 * should consume i18n through `<I18nProvider>` + `useT()` instead, so that
 * calling `setLocale("sn")` actually triggers a re-render.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import {
  LOCALE_STORAGE_KEY,
  setLocale as setLocaleModule,
  tStatic,
  type Locale,
  type TranslationVars,
} from "./index";

interface I18nContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string, vars?: TranslationVars) => string;
}

const I18nContext = createContext<I18nContextValue | undefined>(undefined);

interface I18nProviderProps {
  children: ReactNode;
  defaultLocale?: Locale;
}

function readStoredLocale(fallback: Locale): Locale {
  if (typeof window === "undefined") return fallback;
  try {
    const stored = window.localStorage.getItem(LOCALE_STORAGE_KEY);
    if (stored === "en" || stored === "sn") return stored;
  } catch {
    // localStorage may throw in private-mode or sandboxed iframes; ignore.
  }
  return fallback;
}

export function I18nProvider({ children, defaultLocale = "en" }: I18nProviderProps) {
  // Render with the default on the server so SSR output is stable; hydrate
  // from localStorage on mount.
  const [locale, setLocaleState] = useState<Locale>(defaultLocale);

  useEffect(() => {
    const stored = readStoredLocale(defaultLocale);
    if (stored !== locale) {
      setLocaleState(stored);
    }
    // Intentionally only run on mount — we want a one-time hydrate, not a
    // loop with `locale` in the dep array.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    // Keep the module-level mirror in sync so any non-React consumer that
    // calls `t(...)` from `./index` in the same session reads the same value.
    setLocaleModule(next);
  }, []);

  const t = useCallback(
    (key: string, vars?: TranslationVars) => tStatic(locale, key, vars),
    [locale],
  );

  const value = useMemo<I18nContextValue>(
    () => ({ locale, setLocale, t }),
    [locale, setLocale, t],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

/**
 * Hook for client components to consume the current locale + a reactive
 * translator. Throws if used outside `<I18nProvider>` so misuse is loud.
 */
export function useT(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (ctx === undefined) {
    throw new Error("useT must be used within an I18nProvider");
  }
  return ctx;
}
