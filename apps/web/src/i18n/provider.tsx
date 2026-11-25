import { useEffect, useState, type ReactNode } from "react";
import { LocaleContext } from "./index";
import { isLocale, pickLocale, type Locale } from "./locales";

/** A language chosen in this browser earlier (the user menu once offered it). */
const STORAGE_KEY = "support-agent.locale";

function storedLocale(): Locale | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return isLocale(value) ? value : null;
  } catch {
    return null;
  }
}

function browserLocale(): Locale {
  return pickLocale(navigator.languages?.join(",") || navigator.language);
}

/**
 * Provides the interface language to `useT` and the components of
 * `components/ui/` (the app frame too), and sets `<html lang>`: the
 * browser's languages, or a language stored in this browser earlier.
 */
export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale] = useState<Locale>(() => storedLocale() ?? browserLocale());

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  return <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>;
}
