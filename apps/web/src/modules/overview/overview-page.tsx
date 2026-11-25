import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ChevronRight, CircleCheck, Circle, ThumbsDown, ThumbsUp } from "lucide-react";
import type { Status } from "@support-agent/shared/api/status";
import { Page, PageHeader } from "@/components/ui/page";
import { ErrorState, LoadingState } from "@/components/ui/states";
import { BotStateBadge } from "@/components/status-badges";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useIsAdmin } from "@/hooks/use-me";
import { useT } from "@/i18n";
import { useFormatter } from "@/lib/format";
import { cn } from "@/components/ui/utils";
import { useStatus } from "./api";
import { messages } from "./messages";

type StepKey = keyof Status["setup"];

const STEPS: {
  key: StepKey;
  to: string;
  adminOnly: boolean;
  title: "stepSlack" | "stepProvider" | "stepKnowledge" | "stepAgent";
  hint: "stepSlackHint" | "stepProviderHint" | "stepKnowledgeHint" | "stepAgentHint";
}[] = [
  { key: "slack", to: "/slack", adminOnly: true, title: "stepSlack", hint: "stepSlackHint" },
  { key: "provider", to: "/providers", adminOnly: true, title: "stepProvider", hint: "stepProviderHint" },
  {
    key: "knowledgeSource",
    to: "/knowledge",
    adminOnly: true,
    title: "stepKnowledge",
    hint: "stepKnowledgeHint",
  },
  { key: "agent", to: "/agents", adminOnly: false, title: "stepAgent", hint: "stepAgentHint" },
];

function BotCard({ status }: { status: Status }) {
  const t = useT(messages);
  const format = useFormatter();
  const { bot } = status;
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>{t("bot")}</h2>
        </CardTitle>
        <CardAction>
          <BotStateBadge state={bot.state} />
        </CardAction>
      </CardHeader>
      <CardContent className="text-muted-foreground grid gap-1 text-sm">
        <p>
          {bot.lastEventAt ? (
            <span title={format.dateTime(bot.lastEventAt)}>
              {t("lastEvent", { when: format.relative(bot.lastEventAt) })}
            </span>
          ) : (
            t("noEvent")
          )}
        </p>
        {bot.state === "connected" && bot.connectedSince ? (
          <p title={format.dateTime(bot.connectedSince)}>
            {t("connectedSince", { when: format.relative(bot.connectedSince) })}
          </p>
        ) : null}
        {bot.state === "unknown" ? <p>{t("unknownHint")}</p> : null}
        {bot.state === "unknown" && bot.lastHeartbeatAt ? (
          <p title={format.dateTime(bot.lastHeartbeatAt)}>
            {t("lastHeartbeat", { when: format.relative(bot.lastHeartbeatAt) })}
          </p>
        ) : null}
        {status.version ? <p>{t("version", { version: status.version })}</p> : null}
      </CardContent>
    </Card>
  );
}

function SetupCard({ status }: { status: Status }) {
  const t = useT(messages);
  const isAdmin = useIsAdmin();
  const done = STEPS.filter((step) => status.setup[step.key]).length;
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>{t("setup")}</h2>
        </CardTitle>
        <CardDescription>
          {done === STEPS.length ? t("setupDone") : t("setupProgress", { done, total: STEPS.length })}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ol className="grid gap-1">
          {STEPS.map((step, index) => {
            const complete = status.setup[step.key];
            const canOpen = !step.adminOnly || isAdmin;
            const body = (
              <>
                {complete ? (
                  <CircleCheck className="text-success size-5 shrink-0" aria-label={t("done")} />
                ) : (
                  <Circle className="text-muted-foreground size-5 shrink-0" aria-label={t("todo")} />
                )}
                <span className="grid min-w-0 flex-1 gap-0.5">
                  <span className={cn("font-medium", complete && "text-muted-foreground line-through")}>
                    {index + 1}. {t(step.title)}
                  </span>
                  <span className="text-muted-foreground text-sm">
                    {canOpen ? t(step.hint) : `${t(step.hint)} ${t("askAdmin")}`}
                  </span>
                </span>
              </>
            );
            return (
              <li key={step.key}>
                {canOpen ? (
                  <Link
                    to={step.to}
                    className="hover:bg-muted focus-visible:ring-ring/50 flex items-center gap-3 rounded-md p-2 outline-none focus-visible:ring-[3px]"
                  >
                    {body}
                    <ChevronRight className="text-muted-foreground size-4 shrink-0" aria-hidden />
                  </Link>
                ) : (
                  <div className="flex items-center gap-3 p-2">{body}</div>
                )}
              </li>
            );
          })}
        </ol>
      </CardContent>
    </Card>
  );
}

function CountsCard({ status }: { status: Status }) {
  const t = useT(messages);
  const format = useFormatter();
  const counts = status.last24h;
  const items: { label: string; value: number; icon?: ReactNode; tone?: string }[] = [
    { label: t("messages"), value: counts.messages },
    { label: t("answered"), value: counts.answered },
    { label: t("silent"), value: counts.silent },
    { label: t("noAnswer"), value: counts.noAnswer },
    { label: t("errors"), value: counts.errors, tone: counts.errors ? "text-destructive" : undefined },
    { label: t("helpful"), value: counts.helpful, icon: <ThumbsUp className="size-4" aria-hidden /> },
    { label: t("notHelpful"), value: counts.notHelpful, icon: <ThumbsDown className="size-4" aria-hidden /> },
  ];
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>{t("last24h")}</h2>
        </CardTitle>
        <CardAction>
          <Button asChild variant="link" size="sm" className="h-auto p-0">
            <Link to="/conversations">{t("allConversations")}</Link>
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-7">
          {items.map((item) => (
            <div key={item.label} className="grid gap-1 rounded-md border p-3">
              <dt className="text-muted-foreground flex items-center gap-1 text-xs">
                {item.icon}
                {item.label}
              </dt>
              <dd className={cn("text-2xl font-semibold tabular-nums", item.tone)}>
                {format.number(item.value)}
              </dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  );
}

function ErrorsCard({ status }: { status: Status }) {
  const t = useT(messages);
  const format = useFormatter();
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>{t("recentErrors")}</h2>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {status.recentErrors.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t("noErrors")}</p>
        ) : (
          <ul className="grid gap-3">
            {status.recentErrors.map((error, index) => (
              <li key={index} className="border-destructive/30 grid gap-0.5 border-l-2 pl-3 text-sm">
                <span className="text-muted-foreground text-xs" title={format.dateTime(error.at)}>
                  {format.relative(error.at)}
                  {error.agentName ? ` · ${error.agentName}` : ""}
                </span>
                <span className="break-words">{error.message}</span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export function OverviewPage() {
  const t = useT(messages);
  const status = useStatus();
  return (
    <Page>
      <PageHeader title={t("title")} description={t("description")} />
      {status.isLoading ? (
        <LoadingState />
      ) : status.isError || !status.data ? (
        <ErrorState error={status.error} onRetry={() => void status.refetch()} />
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <BotCard status={status.data} />
          <SetupCard status={status.data} />
          <div className="lg:col-span-2">
            <CountsCard status={status.data} />
          </div>
          <div className="lg:col-span-2">
            <ErrorsCard status={status.data} />
          </div>
        </div>
      )}
    </Page>
  );
}
