import { defineMessages } from "@/i18n";

/** Words the components share. */
export const common = defineMessages({
  en: {
    cancel: "Cancel",
    confirm: "Confirm",
    back: "Back",
    next: "Next",
    loading: "Loading…",
    retry: "Retry",
    copy: "Copy",
    copied: "Copied",
    error: "Something went wrong",
    page: "Page {page} of {pages}",
    total: "{count} entries",
    total_one: "1 entry",
    close: "Close",
    sidebar: "Sidebar",
    sidebarDescription: "The app's navigation.",
    toggleSidebar: "Show or hide the sidebar",
  },
  de: {
    cancel: "Abbrechen",
    confirm: "Bestätigen",
    back: "Zurück",
    next: "Weiter",
    loading: "Wird geladen…",
    retry: "Erneut versuchen",
    copy: "Kopieren",
    copied: "Kopiert",
    error: "Etwas ist schiefgelaufen",
    page: "Seite {page} von {pages}",
    total: "{count} Einträge",
    total_one: "1 Eintrag",
    close: "Schließen",
    sidebar: "Seitenleiste",
    sidebarDescription: "Die Navigation der App.",
    toggleSidebar: "Seitenleiste ein- oder ausblenden",
  },
});

/** The message of an error of any kind; English fallback for values without one. */
export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string" && error !== "") return error;
  const message = (error as { message?: unknown } | null)?.message;
  if (typeof message === "string" && message !== "") return message;
  return "Something went wrong";
}
