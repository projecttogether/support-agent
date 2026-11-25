import { useMemo } from "react";
import { useLocale } from "@/i18n";
import type { Locale } from "@/i18n/locales";

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 365 * 24 * 3600],
  ["month", 30 * 24 * 3600],
  ["week", 7 * 24 * 3600],
  ["day", 24 * 3600],
  ["hour", 3600],
  ["minute", 60],
  ["second", 1],
];

/** Dates, times and numbers in the interface language. */
export function createFormatter(locale: Locale, now: () => number = Date.now) {
  const dateTime = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" });
  const number = new Intl.NumberFormat(locale);
  const relative = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  return {
    dateTime: (iso: string) => dateTime.format(new Date(iso)),
    number: (value: number) => number.format(value),
    /** "3 minutes ago", "yesterday". */
    relative: (iso: string) => {
      const seconds = Math.round((new Date(iso).getTime() - now()) / 1000);
      for (const [unit, size] of UNITS) {
        if (Math.abs(seconds) >= size || unit === "second") {
          return relative.format(Math.round(seconds / size), unit);
        }
      }
      return relative.format(0, "second");
    },
  };
}

export type Formatter = ReturnType<typeof createFormatter>;

export function useFormatter(): Formatter {
  const locale = useLocale();
  return useMemo(() => createFormatter(locale), [locale]);
}
