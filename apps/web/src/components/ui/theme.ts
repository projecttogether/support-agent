import { useSyncExternalStore } from "react";

/**
 * The theme a page shows: "dark" while <html> has the class `dark` (which
 * the app's theme switch sets, lib/theme.tsx), else "light". Follows changes.
 */
export function useDocumentTheme(): "light" | "dark" {
  return useSyncExternalStore(subscribe, snapshot, () => "light");
}

function snapshot(): "light" | "dark" {
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

function subscribe(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  return () => observer.disconnect();
}

/** What a person chose under "Appearance": light, dark, or as the device is set. */
export type ThemePreference = "light" | "dark" | "system";

export const THEME_PREFERENCES: readonly ThemePreference[] = ["light", "dark", "system"];
