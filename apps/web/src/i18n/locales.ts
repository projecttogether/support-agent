/** Languages of the user interface. */
export const LOCALES = ["en", "de"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

/** The best supported locale for a browser language list or a stored value. */
export function pickLocale(input: string | null | undefined, fallback: Locale = DEFAULT_LOCALE): Locale {
  if (!input) return fallback;
  for (const part of input.split(",")) {
    const tag = part.split(";")[0]?.trim().toLowerCase().slice(0, 2);
    if (isLocale(tag)) return tag;
  }
  return fallback;
}
