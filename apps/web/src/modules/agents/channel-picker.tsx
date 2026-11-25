import { useId, useMemo, useState } from "react";
import { AlertTriangle, Check, Hash, Lock, Plus, X } from "lucide-react";
import { slackChannelIdSchema } from "@support-agent/shared/api/agents";
import type { SlackChannel } from "@support-agent/shared/api/slack";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Spinner } from "@/components/ui/spinner";
import { useIsAdmin } from "@/hooks/use-me";
import { useLocale, useT } from "@/i18n";
import { errorMessage } from "@/lib/api";
import { cn } from "@/components/ui/utils";
import { translateMessage } from "@/lib/validation";
import {
  isSlackNotConfigured,
  useSlackBotName,
  useSlackChannels,
  useSlackSettings,
} from "@/modules/slack/api";
import { useAgents } from "./api";
import { messages } from "./messages";

/** Why a channel can't be chosen for this agent: another agent has it. */
function takenBy(channel: SlackChannel, agentId: string | null) {
  return channel.agentId !== null && channel.agentId !== agentId ? channel.agentId : null;
}

/**
 * The agent's Slack channels: picked from the channels the bot can see, or
 * typed as IDs (before Slack is connected, or for private channels the bot
 * can't list yet).
 */
export function ChannelPicker(props: {
  id: string;
  agentId: string | null;
  value: string[];
  onChange: (channels: string[]) => void;
  /** Names the server cached for the saved channels. */
  knownNames: Record<string, string | null>;
  error?: string;
}) {
  const t = useT(messages);
  const locale = useLocale();
  const isAdmin = useIsAdmin();
  const channels = useSlackChannels();
  const slack = useSlackSettings(isAdmin);
  const agents = useAgents();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [typedError, setTypedError] = useState<string | null>(null);
  const manualId = useId();

  const byId = useMemo(
    () => new Map((channels.data ?? []).map((channel) => [channel.id, channel])),
    [channels.data],
  );
  const agentNames = useMemo(
    () => new Map((agents.data ?? []).map((agent) => [agent.id, agent.name])),
    [agents.data],
  );
  const botName = useSlackBotName();
  const bot = slack.data?.botName ?? botName.data ?? t("botFallback");
  const nameOf = (id: string) => byId.get(id)?.name ?? props.knownNames[id] ?? null;

  const toggle = (id: string) => {
    props.onChange(
      props.value.includes(id) ? props.value.filter((item) => item !== id) : [...props.value, id],
    );
  };

  const addTyped = () => {
    const parsed = slackChannelIdSchema.safeParse(typed.trim().toUpperCase());
    if (!parsed.success) {
      setTypedError(translateMessage(parsed.error.issues[0]?.message ?? "", locale));
      return;
    }
    if (props.value.includes(parsed.data)) {
      setTypedError(t("alreadyAdded"));
      return;
    }
    props.onChange([...props.value, parsed.data]);
    setTyped("");
    setTypedError(null);
  };

  return (
    <div className="grid gap-3">
      {props.value.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t("noChannelsChosen")}</p>
      ) : (
        <ul className="grid gap-2" aria-label={t("channels")}>
          {props.value.map((id) => {
            const channel = byId.get(id);
            const name = nameOf(id);
            const notMember = channel ? !channel.isMember : false;
            const label = name ? `#${name}` : id;
            return (
              <li key={id} className="flex items-start gap-2 rounded-md border px-3 py-2">
                {channel?.isPrivate ? (
                  <Lock
                    className="text-muted-foreground mt-0.5 size-4 shrink-0"
                    aria-label={t("privateChannel")}
                  />
                ) : (
                  <Hash className="text-muted-foreground mt-0.5 size-4 shrink-0" aria-hidden />
                )}
                <div className="grid min-w-0 flex-1 gap-0.5">
                  <span className="truncate text-sm font-medium">{name ?? id}</span>
                  {name ? <span className="text-muted-foreground font-mono text-xs">{id}</span> : null}
                  {notMember ? (
                    <span className="flex items-start gap-1 text-xs text-amber-700 dark:text-amber-400">
                      <AlertTriangle className="mt-px size-3.5 shrink-0" aria-hidden />
                      <span>
                        {t("notMember")} {t("inviteBot", { bot })}
                      </span>
                    </span>
                  ) : null}
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-7 shrink-0"
                  aria-label={t("removeChannel", { channel: label })}
                  onClick={() => toggle(id)}
                >
                  <X />
                </Button>
              </li>
            );
          })}
        </ul>
      )}

      {channels.isError ? (
        <Alert>
          <AlertTriangle />
          <AlertDescription>
            {isSlackNotConfigured(channels.error)
              ? t("slackNotConfigured")
              : t("channelsFailed", { message: errorMessage(channels.error) })}
          </AlertDescription>
        </Alert>
      ) : (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              id={props.id}
              type="button"
              variant="outline"
              className="w-full justify-start sm:w-auto"
              aria-expanded={open}
              aria-invalid={props.error ? true : undefined}
              disabled={channels.isLoading}
            >
              {channels.isLoading ? <Spinner /> : <Plus />}
              {t("addChannel")}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80 max-w-[calc(100vw-2rem)] p-0" align="start">
            <Command>
              <CommandInput aria-label={t("channelSearch")} placeholder={t("channelSearch")} />
              <CommandList>
                <CommandEmpty>{t("channelsNone")}</CommandEmpty>
                <CommandGroup>
                  {(channels.data ?? []).map((channel) => {
                    const other = takenBy(channel, props.agentId);
                    const selected = props.value.includes(channel.id);
                    return (
                      <CommandItem
                        key={channel.id}
                        value={`${channel.name} ${channel.id}`}
                        disabled={Boolean(other) && !selected}
                        onSelect={() => toggle(channel.id)}
                      >
                        <Check className={cn(selected ? "opacity-100" : "opacity-0")} />
                        {channel.isPrivate ? <Lock aria-label={t("privateChannel")} /> : <Hash aria-hidden />}
                        <div className="grid min-w-0">
                          <span className="truncate">{channel.name}</span>
                          {other ? (
                            <span className="text-muted-foreground truncate text-xs">
                              {agentNames.get(other)
                                ? t("usedBy", { agent: agentNames.get(other)! })
                                : t("usedByOther")}
                            </span>
                          ) : !channel.isMember ? (
                            <span className="text-muted-foreground truncate text-xs">{t("notMember")}</span>
                          ) : null}
                        </div>
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      )}

      <div className="grid gap-2">
        <FieldLabel htmlFor={manualId} className="text-muted-foreground text-xs font-normal">
          {t("channelId")}
        </FieldLabel>
        <div className="flex gap-2">
          <Input
            id={manualId}
            value={typed}
            placeholder="C01ABCDEF"
            className="max-w-48 font-mono"
            spellCheck={false}
            autoComplete="off"
            aria-invalid={typedError ? true : undefined}
            aria-describedby={`${manualId}-hint`}
            onChange={(event) => {
              setTyped(event.target.value);
              setTypedError(null);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                addTyped();
              }
            }}
          />
          <Button type="button" variant="secondary" onClick={addTyped} disabled={!typed.trim()}>
            {t("addById")}
          </Button>
        </div>
        <FieldDescription id={`${manualId}-hint`}>{t("channelIdHint")}</FieldDescription>
        {typedError ? <FieldError>{typedError}</FieldError> : null}
      </div>
      {props.error ? <FieldError>{props.error}</FieldError> : null}
    </div>
  );
}
