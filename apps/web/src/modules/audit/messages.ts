import { defineMessages } from "@/i18n";

export const messages = defineMessages({
  en: {
    title: "Audit log",
    description: "Who changed what. Entries never contain secrets.",
    empty: "No entries yet",
    colWhen: "When",
    colWho: "Who",
    colWhat: "What",
    system: "System",
  },
  de: {
    title: "Protokoll",
    description: "Wer was geändert hat. Einträge enthalten nie Geheimnisse.",
    empty: "Noch keine Einträge",
    colWhen: "Wann",
    colWho: "Wer",
    colWhat: "Was",
    system: "System",
  },
});
