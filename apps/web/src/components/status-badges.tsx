import {
  CircleAlert,
  CircleCheck,
  CircleDashed,
  CircleEllipsis,
  CircleHelp,
  CircleMinus,
  Loader,
} from "lucide-react";
import type { Outcome } from "@support-agent/shared/api/agents";
import type { BotState } from "@support-agent/shared/api/status";
import { Badge } from "@/components/ui/badge";
import { defineMessages, useT } from "@/i18n";
import { cn } from "@/components/ui/utils";

export const outcomeMessages = defineMessages({
  en: {
    pending: "In progress",
    answered: "Answered",
    silent: "Stayed silent",
    headline: "Waits for the request",
    no_answer: "No answer found",
    error: "Error",
  },
  de: {
    pending: "In Bearbeitung",
    answered: "Beantwortet",
    silent: "Hat geschwiegen",
    headline: "Wartet auf die Anfrage",
    no_answer: "Keine Antwort gefunden",
    error: "Fehler",
  },
});

const OUTCOME_STYLE: Record<Outcome, string> = {
  pending: "border-border text-muted-foreground",
  answered: "bg-success/15 text-success border-success/30",
  silent: "bg-muted text-muted-foreground",
  headline: "border-primary/30 text-primary",
  no_answer: "bg-warning/15 text-foreground border-warning/40",
  error: "bg-destructive/10 text-destructive border-destructive/30",
};

const OUTCOME_ICON = {
  pending: Loader,
  answered: CircleCheck,
  silent: CircleMinus,
  headline: CircleEllipsis,
  no_answer: CircleHelp,
  error: CircleAlert,
} satisfies Record<Outcome, unknown>;

/** What the agent did with a message. */
export function OutcomeBadge({ outcome, className }: { outcome: Outcome; className?: string }) {
  const t = useT(outcomeMessages);
  const Icon = OUTCOME_ICON[outcome];
  return (
    <Badge variant="outline" className={cn(OUTCOME_STYLE[outcome], className)}>
      <Icon aria-hidden />
      {t(outcome)}
    </Badge>
  );
}

export const botStateMessages = defineMessages({
  en: {
    connected: "Connected",
    connecting: "Connecting",
    disconnected: "Disconnected",
    not_configured: "Not configured",
    unknown: "Unknown",
  },
  de: {
    connected: "Verbunden",
    connecting: "Verbindet",
    disconnected: "Getrennt",
    not_configured: "Nicht eingerichtet",
    unknown: "Unbekannt",
  },
});

const BOT_STYLE: Record<BotState, string> = {
  connected: "bg-success/15 text-success border-success/30",
  connecting: "bg-warning/15 text-foreground border-warning/40",
  disconnected: "bg-destructive/10 text-destructive border-destructive/30",
  not_configured: "bg-muted text-muted-foreground",
  unknown: "bg-muted text-muted-foreground",
};

/** Whether the bot is connected to Slack. */
export function BotStateBadge({ state }: { state: BotState }) {
  const t = useT(botStateMessages);
  const Icon =
    state === "connected"
      ? CircleCheck
      : state === "disconnected"
        ? CircleAlert
        : state === "connecting"
          ? Loader
          : CircleDashed;
  return (
    <Badge variant="outline" className={cn("text-sm", BOT_STYLE[state])}>
      <Icon aria-hidden />
      {t(state)}
    </Badge>
  );
}

/** On/off of an agent. */
export function EnabledBadge({ enabled, on, off }: { enabled: boolean; on: string; off: string }) {
  return (
    <Badge
      variant={enabled ? "outline" : "secondary"}
      className={enabled ? "bg-success/15 text-success border-success/30" : ""}
    >
      {enabled ? on : off}
    </Badge>
  );
}
