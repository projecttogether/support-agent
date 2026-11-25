import { defineMessages } from "@/i18n";

export const messages = defineMessages({
  en: {
    title: "Settings",
    description: "Settings for all agents.",
    retention: "Keep message text for (days)",
    retentionHint:
      "Questions and answers are deleted after this many days; outcomes and timings stay. 0 keeps no message text at all.",
    errorMessage: "Message when an agent fails",
    errorMessageHint: "Posted when a model or knowledge source can't be reached.",
    workingReaction: "Working reaction",
    workingReactionHint:
      "Emoji name the bot adds to a question while it works on it, e.g. eyes. Leave empty for none. Needs the reactions:write scope.",
    saved: "Settings saved",
  },
  de: {
    title: "Einstellungen",
    description: "Einstellungen für alle Agenten.",
    retention: "Nachrichtentext aufbewahren (Tage)",
    retentionHint:
      "Fragen und Antworten werden nach so vielen Tagen gelöscht; Ergebnisse und Zeiten bleiben. 0 bewahrt gar keinen Nachrichtentext auf.",
    errorMessage: "Nachricht, wenn ein Agent ausfällt",
    errorMessageHint: "Wird gepostet, wenn ein Modell oder eine Wissensquelle nicht erreichbar ist.",
    workingReaction: "Arbeits-Reaktion",
    workingReactionHint:
      "Emoji-Name, den der Bot an eine Frage hängt, während er daran arbeitet, z. B. eyes. Leer lassen für keine. Braucht den Scope reactions:write.",
    saved: "Einstellungen gespeichert",
  },
});
